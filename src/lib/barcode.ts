import { Capacitor } from '@capacitor/core';
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { BarcodeDetector as ZxingDetector, prepareZXingModule } from 'barcode-detector/ponyfill';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;

export interface Detector {
  detect(source: HTMLVideoElement | ImageBitmap | HTMLCanvasElement): Promise<{ rawValue: string }[]>;
}

interface NativeBarcodeDetector {
  new (opts: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
}

let cached: Promise<Detector> | null = null;

/**
 * Usa el detector nativo del navegador cuando existe (Chrome en Android)
 * y, si no, el lector ZXing en WebAssembly incluido en la app (funciona sin conexión).
 */
export function getDetector(): Promise<Detector> {
  cached ??= (async () => {
    const Native = (globalThis as { BarcodeDetector?: NativeBarcodeDetector }).BarcodeDetector;
    if (Native) {
      try {
        const supported = await Native.getSupportedFormats();
        if (supported.includes('ean_13')) return new Native({ formats: FORMATS.filter((f) => supported.includes(f)) });
      } catch {
        /* se usa el lector incluido */
      }
    }
    prepareZXingModule({
      overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
    });
    return new ZxingDetector({ formats: [...FORMATS] }) as unknown as Detector;
  })();
  return cached;
}

/** Valida el dígito de control de un código EAN-13, EAN-8 o UPC-A. */
export function isValidBarcode(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export type GoogleScan = { status: 'code'; code: string } | { status: 'cancelled' } | { status: 'unavailable' };

/**
 * Escáner de códigos de Google (Android): abre su propia pantalla de cámara con enfoque y zoom automáticos,
 * mucho más fiable que una cámara web para códigos pequeños o curvos.
 * Devuelve "unavailable" si no se puede usar (navegador, teléfono sin servicios de Google o módulo aún sin instalar).
 */
export async function googleScan(): Promise<GoogleScan> {
  if (!Capacitor.isNativePlatform()) return { status: 'unavailable' };
  try {
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!available) {
      // Se deja instalando para la próxima vez; por ahora se usa la cámara de la app.
      void BarcodeScanner.installGoogleBarcodeScannerModule().catch(() => undefined);
      return { status: 'unavailable' };
    }
  } catch {
    return { status: 'unavailable' };
  }
  try {
    const res = await BarcodeScanner.scan({ formats: [BarcodeFormat.Ean13, BarcodeFormat.Ean8, BarcodeFormat.UpcA, BarcodeFormat.UpcE], autoZoom: true });
    const code = res.barcodes.map((b) => (b.rawValue ?? '').replace(/\D/g, '')).find((c) => c.length >= 8);
    return code ? { status: 'code', code } : { status: 'cancelled' };
  } catch (e) {
    return e instanceof Error && /cancel/i.test(e.message) ? { status: 'cancelled' } : { status: 'unavailable' };
  }
}

/** Capacidades de la cámara que el navegador no incluye en sus tipos estándar. */
export interface CameraCaps {
  zoom?: { min: number; max: number; step?: number };
  torch?: boolean;
  focusMode?: string[];
}

export function cameraCaps(track: MediaStreamTrack): CameraCaps {
  try {
    return (track.getCapabilities?.() ?? {}) as CameraCaps;
  } catch {
    return {};
  }
}

/** Aplica un ajuste avanzado de cámara (zoom, linterna o enfoque); se ignora si el teléfono no lo admite. */
export async function applyCamera(track: MediaStreamTrack, setting: { zoom?: number; torch?: boolean; focusMode?: string }): Promise<void> {
  await track.applyConstraints({ advanced: [setting as MediaTrackConstraintSet] }).catch(() => undefined);
}

/**
 * Cámaras traseras disponibles, con la principal primero.
 * En teléfonos con varios lentes el sistema a veces entrega el gran angular, que no enfoca de cerca.
 */
export async function backCameras(): Promise<MediaDeviceInfo[]> {
  const all = (await navigator.mediaDevices.enumerateDevices().catch(() => [])).filter((d) => d.kind === 'videoinput');
  const back = all.filter((d) => /back|rear|trasera|environment/i.test(d.label));
  const list = back.length > 0 ? back : all;
  const index = (d: MediaDeviceInfo) => Number(d.label.match(/(\d+)/)?.[1] ?? 99);
  return list.slice().sort((a, b) => index(a) - index(b));
}
