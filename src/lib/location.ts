import { Capacitor, registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import { Geolocation } from '@capacitor/geolocation';

export interface Fix {
  lat: number;
  lon: number;
  ele: number | null;
  /** Precisión horizontal en metros. */
  acc: number;
  t: number;
}

export class LocationError extends Error {
  constructor(
    message: string,
    public denied = false,
  ) {
    super(message);
  }
}

const DENIED = 'Kaizen no tiene permiso de ubicación. Actívalo en los ajustes del teléfono (Ubicación → Permitir).';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

/**
 * Sigue la ubicación de forma continua. En Android usa un servicio en primer plano con una notificación,
 * de modo que el registro continúa con la pantalla apagada o la app en segundo plano.
 * Devuelve una función para detener el seguimiento.
 */
export async function watchLocation(onFix: (f: Fix) => void, onError: (e: LocationError) => void): Promise<() => void> {
  if (Capacitor.isNativePlatform()) {
    const id = await BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: 'Kaizen está registrando tu actividad',
        backgroundMessage: 'Toca para volver a la app.',
        requestPermissions: true,
        stale: false,
        distanceFilter: 3,
      },
      (loc, err) => {
        if (err) {
          onError(new LocationError(err.code === 'NOT_AUTHORIZED' ? DENIED : 'No se pudo obtener la ubicación.', err.code === 'NOT_AUTHORIZED'));
          return;
        }
        if (loc) onFix({ lat: loc.latitude, lon: loc.longitude, ele: loc.altitude, acc: loc.accuracy, t: loc.time ?? Date.now() });
      },
    );
    return () => void BackgroundGeolocation.removeWatcher({ id });
  }
  if (!navigator.geolocation) throw new LocationError('Este dispositivo no tiene ubicación disponible.');
  const id = navigator.geolocation.watchPosition(
    (p) => onFix({ lat: p.coords.latitude, lon: p.coords.longitude, ele: p.coords.altitude, acc: p.coords.accuracy, t: p.timestamp || Date.now() }),
    (e) => onError(new LocationError(e.code === e.PERMISSION_DENIED ? DENIED : 'No se pudo obtener la ubicación.', e.code === e.PERMISSION_DENIED)),
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

/** Ubicación puntual (para el clima y para centrar el mapa). */
export async function currentLocation(): Promise<Fix> {
  if (Capacitor.isNativePlatform()) {
    try {
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
        const asked = await Geolocation.requestPermissions();
        if (asked.location !== 'granted' && asked.coarseLocation !== 'granted') throw new LocationError(DENIED, true);
      }
      const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
      return { lat: p.coords.latitude, lon: p.coords.longitude, ele: p.coords.altitude, acc: p.coords.accuracy, t: p.timestamp };
    } catch (e) {
      throw e instanceof LocationError ? e : new LocationError('No se pudo obtener tu ubicación. Revisa que el GPS esté encendido.');
    }
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new LocationError('Este dispositivo no tiene ubicación disponible.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, ele: p.coords.altitude, acc: p.coords.accuracy, t: p.timestamp }),
      (e) => reject(new LocationError(e.code === e.PERMISSION_DENIED ? DENIED : 'No se pudo obtener tu ubicación.', e.code === e.PERMISSION_DENIED)),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
    );
  });
}
