import { Download, Play, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ProfileChart } from '../components/charts';
import MapView from '../components/MapView';
import { Header, Spinner } from '../components/ui';
import { type LatLon, type Pt, TERRAIN, estimateSeconds, fmtDuration, fmtKm, profile, sample, toGpx } from '../lib/geo';
import { startRecording, useRec } from '../lib/recorder';
import { safeFileName, shareFile } from '../lib/share';
import { deleteTrack, loadTrack } from '../lib/tracks';
import { fmt } from '../lib/util';
import { back, replace, useRoute } from '../router';
import { useStore, useUi } from '../store';

export default function RouteDetail() {
  const { query } = useRoute();
  const id = query.get('id') ?? '';
  const route = useStore((s) => s.routes.find((r) => r.id === id));
  const removeRoute = useStore((s) => s.removeRoute);
  const showToast = useUi((s) => s.showToast);
  const recStatus = useRec((s) => s.status);
  const [points, setPoints] = useState<Pt[] | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!route) {
      back();
      return;
    }
    let alive = true;
    void loadTrack(`route-${id}`).then((p) => alive && setPoints(p));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const line = useMemo<LatLon[]>(() => (points && points.length > 1 ? points.map((p) => [p[1], p[2]]) : (route?.preview ?? [])), [points, route]);
  const tracks = useMemo(() => [{ points: line, planned: true }], [line]);
  const ends = useMemo<LatLon[]>(() => (line.length > 1 ? [line[0], line[line.length - 1]] : []), [line]);
  const prof = useMemo(() => (points ? sample(profile(points, TERRAIN.window), 240) : []), [points]);
  if (!route) return null;

  const start = async () => {
    setStarting(true);
    try {
      await startRecording('hike', route.id);
      replace('/record');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo iniciar el GPS');
      setStarting(false);
    }
  };

  const exportGpx = async () => {
    if (!points || points.length < 2) return showToast('La ruta no está disponible');
    try {
      await shareFile(`${safeFileName(route.name)}.gpx`, toGpx(route.name, points, false), 'application/gpx+xml', route.name);
    } catch (e) {
      if (!(e instanceof Error && /cancel/i.test(e.message))) showToast('No se pudo exportar el GPX');
    }
  };

  return (
    <>
      <div className="screen with-footer">
        <Header
          title="Ruta"
          right={
            <>
              <button className="icon-btn" aria-label="Exportar GPX" onClick={() => void exportGpx()}>
                <Download size={20} />
              </button>
              <button
                className="icon-btn"
                aria-label="Eliminar ruta"
                onClick={() => {
                  removeRoute(route.id);
                  void deleteTrack(`route-${route.id}`);
                  showToast('Ruta eliminada');
                  back();
                }}
              >
                <Trash2 size={20} color="var(--critical)" />
              </button>
            </>
          }
        />
        <h2 className="title-xl" style={{ fontSize: 23 }}>
          {route.name}
        </h2>
        <MapView tracks={tracks} markers={ends} fitKey={`${id}-${line.length}`} height="42vh" />
        <div className="metrics">
          <div className="metric">
            <div className="v num">
              {fmtKm(route.distanceM)}
              <small>km</small>
            </div>
            <div className="l">Distancia</div>
          </div>
          <div className="metric">
            <div className="v num">
              {fmt(route.ascentM)}
              <small>m</small>
            </div>
            <div className="l">Desnivel +</div>
          </div>
          <div className="metric">
            <div className="v num">{fmtDuration(estimateSeconds(route.distanceM, route.ascentM, 'hike'))}</div>
            <div className="l">Tiempo aprox.</div>
          </div>
        </div>
        <p className="xs muted num">Descenso {fmt(route.descentM)} m · el tiempo es una estimación a paso de cerro, sin contar descansos.</p>
        {points === null ? (
          <Spinner label="Cargando ruta…" />
        ) : (
          prof.length > 1 && (
            <div className="card col">
              <h2 className="card-title">Perfil de altitud</h2>
              <ProfileChart data={prof} />
            </div>
          )
        )}
      </div>
      <div className="footer-bar">
        <button className="btn" disabled={starting || recStatus !== 'idle'} onClick={() => void start()}>
          <Play size={18} /> {recStatus !== 'idle' ? 'Ya hay una actividad en curso' : starting ? 'Buscando GPS…' : 'Iniciar esta ruta'}
        </button>
      </div>
    </>
  );
}
