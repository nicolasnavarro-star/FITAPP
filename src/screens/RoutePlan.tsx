import { FileUp, LocateFixed, Undo2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { ProfileChart } from '../components/charts';
import MapView from '../components/MapView';
import { Field, Header, Segmented, Sheet } from '../components/ui';
import { type LatLon, type Pt, TERRAIN, computeStats, estimateSeconds, fmtDuration, fmtKm, parseGpx, profile, sample } from '../lib/geo';
import { currentLocation } from '../lib/location';
import { densify, fetchElevations, trailSegment } from '../lib/routing';
import { saveTrack } from '../lib/tracks';
import { fmt, uid } from '../lib/util';
import { replace } from '../router';
import { useStore, useUi } from '../store';

type Leg = [number, number, number | null][];

export default function RoutePlan() {
  const lastLoc = useStore((s) => s.lastLoc);
  const setLastLoc = useStore((s) => s.setLastLoc);
  const saveRoute = useStore((s) => s.saveRoute);
  const showToast = useUi((s) => s.showToast);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'trail' | 'straight'>('trail');
  const [waypoints, setWaypoints] = useState<LatLon[]>([]);
  const [legs, setLegs] = useState<Leg[]>([]);
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<LatLon | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const geometry = useMemo<Pt[]>(() => {
    const out: Pt[] = [];
    if (waypoints.length > 0 && legs.length === 0) return out;
    legs.forEach((leg, i) => leg.forEach((c, j) => (i > 0 && j === 0 ? undefined : out.push([0, c[0], c[1], c[2]]))));
    return out;
  }, [legs, waypoints.length]);
  const line = useMemo<LatLon[]>(() => geometry.map((p) => [p[1], p[2]]), [geometry]);
  const tracks = useMemo(() => [{ points: line, planned: true }], [line]);
  const stats = useMemo(() => computeStats(geometry, 'hike', TERRAIN), [geometry]);
  const prof = useMemo(() => sample(profile(geometry, TERRAIN.window), 240), [geometry]);

  const addPoint = async (p: LatLon) => {
    if (busy) return;
    const prev = waypoints[waypoints.length - 1];
    setWaypoints([...waypoints, p]);
    if (!prev) return;
    setBusy(true);
    let leg: Leg | null = null;
    if (mode === 'trail') {
      try {
        leg = await trailSegment(prev, p);
      } catch {
        showToast('No se encontró un sendero para ese tramo: se trazó en línea recta');
      }
    }
    if (!leg) {
      const coords = [prev, ...densify(prev, p)];
      let eles: (number | null)[] = coords.map(() => null);
      try {
        eles = await fetchElevations(coords);
      } catch {
        /* sin conexión: el tramo queda sin altitud */
      }
      leg = coords.map((c, i) => [c[0], c[1], eles[i]]);
    } else if (leg.some((c) => c[2] === null)) {
      try {
        const eles = await fetchElevations(leg.map((c) => [c[0], c[1]]));
        leg = leg.map((c, i) => [c[0], c[1], eles[i]]);
      } catch {
        /* se conserva lo que haya */
      }
    }
    setLegs((l) => [...l, leg]);
    setBusy(false);
  };

  const undo = () => {
    if (busy || waypoints.length === 0) return;
    setWaypoints(waypoints.slice(0, -1));
    if (waypoints.length > 1) setLegs(legs.slice(0, -1));
  };

  const locate = async () => {
    try {
      const fix = await currentLocation();
      setMe([fix.lat, fix.lon]);
      setLastLoc(fix.lat, fix.lon);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo obtener tu ubicación');
    }
  };

  const store = async (routeName: string, pts: Pt[]) => {
    const st = computeStats(pts, 'hike', TERRAIN);
    const id = uid();
    await saveTrack(`route-${id}`, pts);
    saveRoute({
      id,
      name: routeName.trim() || 'Ruta sin nombre',
      createdAt: Date.now(),
      distanceM: Math.round(st.distanceM),
      ascentM: Math.round(st.ascentM),
      descentM: Math.round(st.descentM),
      preview: sample(pts, 80).map((p) => [p[1], p[2]]),
    });
    showToast('Ruta guardada');
    replace(`/route?id=${id}`);
  };

  const importGpx = async (file: File | undefined) => {
    if (!file) return;
    try {
      const gpx = parseGpx(await file.text());
      let pts: Pt[] = sample(gpx.points, 2000).map((p) => [0, p[1], p[2], p[3]]);
      if (pts.some((p) => p[3] === null)) {
        try {
          const eles = await fetchElevations(sample(pts, 300).map((p) => [p[1], p[2]]));
          if (pts.length <= 300) pts = pts.map((p, i) => [0, p[1], p[2], eles[i]]);
        } catch {
          /* sin altitud */
        }
      }
      await store(gpx.name || file.name.replace(/\.gpx$/i, ''), pts);
    } catch {
      showToast('No se pudo leer el archivo GPX');
    }
  };

  return (
    <>
      <div className="screen with-footer">
        <Header
          title="Trazar ruta"
          right={
            <>
              <button className="icon-btn" aria-label="Importar GPX" onClick={() => fileRef.current?.click()}>
                <FileUp size={20} />
              </button>
              <button className="icon-btn" aria-label="Centrar en mi ubicación" onClick={() => void locate()}>
                <LocateFixed size={20} />
              </button>
            </>
          }
        />
        <input
          ref={fileRef}
          type="file"
          accept=".gpx,application/gpx+xml,application/xml,text/xml"
          hidden
          onChange={(e) => {
            void importGpx(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'trail', label: 'Seguir senderos' },
            { value: 'straight', label: 'Línea recta' },
          ]}
        />
        <MapView
          tracks={tracks}
          markers={waypoints}
          position={me}
          follow={me !== null && waypoints.length === 0}
          center={lastLoc ? [lastLoc.lat, lastLoc.lon] : undefined}
          onTap={(p) => void addPoint(p)}
          height="44vh"
        />
        <p className="small muted" role="status">
          {busy ? 'Calculando el tramo…' : waypoints.length === 0 ? 'Toca el mapa para marcar el inicio y luego cada punto por donde quieres pasar.' : waypoints.length === 1 ? 'Toca el siguiente punto de la ruta.' : 'Sigue tocando para alargar la ruta o guárdala.'}
        </p>
        <div className="metrics">
          <div className="metric">
            <div className="v num">
              {fmtKm(stats.distanceM)}
              <small>km</small>
            </div>
            <div className="l">Distancia</div>
          </div>
          <div className="metric">
            <div className="v num">
              {fmt(stats.ascentM)}
              <small>m</small>
            </div>
            <div className="l">Desnivel +</div>
          </div>
          <div className="metric">
            <div className="v num">{stats.distanceM > 0 ? fmtDuration(estimateSeconds(stats.distanceM, stats.ascentM, 'hike')) : '–'}</div>
            <div className="l">Tiempo aprox.</div>
          </div>
        </div>
        {prof.length > 1 && (
          <div className="card col">
            <h2 className="card-title">Perfil de altitud</h2>
            <ProfileChart data={prof} />
          </div>
        )}
      </div>
      <div className="footer-bar">
        <div className="rec-controls">
          <button className="btn secondary" disabled={busy || waypoints.length === 0} onClick={undo}>
            <Undo2 size={18} /> Deshacer
          </button>
          <button className="btn" disabled={busy || geometry.length < 2} onClick={() => setNaming(true)}>
            Guardar ruta
          </button>
        </div>
      </div>
      {naming && (
        <Sheet title="Guardar ruta" onClose={() => setNaming(false)}>
          <Field label="Nombre" value={name} onChange={setName} placeholder="Ej: Cerro Manquehue por el sur" autoFocus />
          <button className="btn" onClick={() => void store(name, geometry)}>
            Guardar
          </button>
        </Sheet>
      )}
    </>
  );
}
