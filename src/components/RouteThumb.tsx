import type { LatLon } from '../lib/geo';

/** Miniatura del trazado de un recorrido (sin mapa de fondo). */
export default function RouteThumb({ points, planned }: { points: LatLon[]; planned?: boolean }) {
  const size = 56;
  const pad = 9;
  if (points.length < 2) return <span className="route-thumb" aria-hidden />;
  const lats = points.map((p) => p[0]);
  const lons = points.map((p) => p[1]);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  // La longitud se comprime según la latitud para que la forma no salga deformada.
  const kx = Math.cos((midLat * Math.PI) / 180);
  const xs = lons.map((l) => l * kx);
  const minX = Math.min(...xs);
  const minY = Math.min(...lats);
  const span = Math.max(Math.max(...xs) - minX, Math.max(...lats) - minY) || 1;
  const scale = (size - pad * 2) / span;
  const offX = (size - (Math.max(...xs) - minX) * scale) / 2;
  const offY = (size - (Math.max(...lats) - minY) * scale) / 2;
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(offX + (xs[i] - minX) * scale).toFixed(1)},${(size - offY - (p[0] - minY) * scale).toFixed(1)}`).join(' ');
  return (
    <svg className="route-thumb" viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <path d={d} fill="none" stroke={planned ? 'var(--protein)' : 'var(--accent)'} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={planned ? '1 5' : undefined} />
    </svg>
  );
}
