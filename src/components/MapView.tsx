import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type { LatLon } from '../lib/geo';

export interface MapTrack {
  points: LatLon[];
  /** Ruta planificada (línea punteada) en vez de recorrido realizado. */
  planned?: boolean;
}

interface Props {
  tracks?: MapTrack[];
  /** Posición actual del usuario. */
  position?: LatLon | null;
  /** Puntos marcados (por ejemplo, los toques al trazar una ruta). */
  markers?: LatLon[];
  /** Mantiene el mapa centrado en la posición actual. */
  follow?: boolean;
  /** Al cambiar este valor, el mapa encuadra todos los recorridos. */
  fitKey?: string;
  center?: LatLon;
  onTap?: (p: LatLon) => void;
  height?: string;
}

const ATTR_OSM = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Mapa con capas topográfica, de calles y satelital. Los recorridos se dibujan aunque no haya conexión para las teselas. */
export default function MapView({ tracks = [], position, markers = [], follow, fitKey, center, onTap, height = '46vh' }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const overlay = useRef<L.LayerGroup | null>(null);
  const tapRef = useRef(onTap);
  tapRef.current = onTap;

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView(center ?? [-33.45, -70.66], center ? 14 : 11);
    const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: `${ATTR_OSM}, SRTM · © OpenTopoMap` });
    const streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: ATTR_OSM });
    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Imágenes © Esri' });
    topo.addTo(m);
    L.control.layers({ Topográfico: topo, Calles: streets, Satélite: sat }, undefined, { position: 'topright' }).addTo(m);
    overlay.current = L.layerGroup().addTo(m);
    m.on('click', (e) => tapRef.current?.([e.latlng.lat, e.latlng.lng]));
    map.current = m;
    // El contenedor puede cambiar de tamaño al terminar la animación de entrada de la pantalla.
    const timer = setTimeout(() => m.invalidateSize(), 300);
    return () => {
      clearTimeout(timer);
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const group = overlay.current;
    if (!group) return;
    group.clearLayers();
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--map-track').trim() || '#e2572b';
    for (const t of tracks) {
      if (t.points.length === 0) continue;
      if (t.planned) L.polyline(t.points, { color: '#1c6bd9', weight: 4, opacity: 0.9, dashArray: '2 9', lineCap: 'round' }).addTo(group);
      else {
        L.polyline(t.points, { color: '#ffffff', weight: 7, opacity: 0.9 }).addTo(group);
        L.polyline(t.points, { color: accent, weight: 4 }).addTo(group);
      }
    }
    markers.forEach((p, i) => {
      const edge = i === 0 || i === markers.length - 1;
      L.circleMarker(p, { radius: edge ? 8 : 5, color: '#ffffff', weight: 2, fillColor: i === 0 ? '#1c9a57' : '#1c6bd9', fillOpacity: 1 }).addTo(group);
    });
    if (position) {
      L.circleMarker(position, { radius: 15, stroke: false, fillColor: '#1c6bd9', fillOpacity: 0.2 }).addTo(group);
      L.circleMarker(position, { radius: 7, color: '#ffffff', weight: 3, fillColor: '#1c6bd9', fillOpacity: 1 }).addTo(group);
    }
  }, [tracks, markers, position]);

  useEffect(() => {
    if (follow && position && map.current) map.current.setView(position, Math.max(map.current.getZoom(), 15), { animate: true });
  }, [follow, position]);

  useEffect(() => {
    const m = map.current;
    if (!m || fitKey === undefined) return;
    const all = tracks.flatMap((t) => t.points);
    if (all.length > 1) m.fitBounds(L.latLngBounds(all), { padding: [28, 28], maxZoom: 16 });
    else if (all.length === 1) m.setView(all[0], 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return <div ref={el} className="map" style={{ height }} role="application" aria-label="Mapa" />;
}
