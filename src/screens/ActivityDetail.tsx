import { Download, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ProfileChart } from '../components/charts';
import MapView from '../components/MapView';
import { Header, Sheet, Spinner } from '../components/ui';
import { type LatLon, type Pt, GPS, SPORTS, TERRAIN, fmtDuration, fmtKm, fmtPace, fmtSpeed, profile, sample, splits, toGpx } from '../lib/geo';
import { safeFileName, shareFile } from '../lib/share';
import { deleteTrack, loadTrack } from '../lib/tracks';
import { fmt, formatDate, toDateKey } from '../lib/util';
import { back, useRoute } from '../router';
import { useStore, useUi } from '../store';

export default function ActivityDetail() {
  const { query } = useRoute();
  const id = query.get('id') ?? '';
  const activity = useStore((s) => s.activities.find((a) => a.id === id));
  const updateActivity = useStore((s) => s.updateActivity);
  const removeActivity = useStore((s) => s.removeActivity);
  const showToast = useUi((s) => s.showToast);
  const [points, setPoints] = useState<Pt[] | null>(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!activity) {
      back();
      return;
    }
    let alive = true;
    void loadTrack(id).then((p) => alive && setPoints(p));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const line = useMemo<LatLon[]>(() => (points && points.length > 1 ? points.map((p) => [p[1], p[2]]) : (activity?.preview ?? [])), [points, activity]);
  const tracks = useMemo(() => [{ points: line }], [line]);
  const ends = useMemo<LatLon[]>(() => (line.length > 1 ? [line[0], line[line.length - 1]] : []), [line]);
  const win = activity?.eleSource === 'terrain' ? TERRAIN.window : GPS.window;
  const prof = useMemo(() => (points ? sample(profile(points, win), 240) : []), [points, win]);
  const parts = useMemo(() => (points && activity ? splits(points, activity.sport, win) : []), [points, activity, win]);

  if (!activity) return null;
  const s = SPORTS[activity.sport];
  const start = new Date(activity.startedAt);
  const vam = activity.movingSec > 120 && activity.ascentM > 0 ? Math.round(activity.ascentM / (activity.movingSec / 3600)) : null;

  const exportGpx = async () => {
    if (!points || points.length < 2) return showToast('El recorrido no está disponible');
    try {
      await shareFile(`${safeFileName(activity.name)}.gpx`, toGpx(activity.name, points), 'application/gpx+xml', activity.name);
    } catch (e) {
      if (!(e instanceof Error && /cancel/i.test(e.message))) showToast('No se pudo exportar el GPX');
    }
  };

  return (
    <div className="screen">
      <Header
        title="Actividad"
        right={
          <>
            <button className="icon-btn" aria-label="Exportar GPX" onClick={() => void exportGpx()}>
              <Download size={20} />
            </button>
            <button className="icon-btn" aria-label="Eliminar actividad" onClick={() => setConfirm(true)}>
              <Trash2 size={20} color="var(--critical)" />
            </button>
          </>
        }
      />
      <div>
        <input
          className="title-xl"
          style={{ width: '100%', border: 0, outline: 0, background: 'transparent', padding: 0, fontSize: 23 }}
          value={activity.name}
          aria-label="Nombre de la actividad"
          onChange={(e) => updateActivity(activity.id, { name: e.target.value.slice(0, 60) })}
        />
        <p className="small muted num">
          {s.label} · {formatDate(toDateKey(start), true)} · {String(start.getHours()).padStart(2, '0')}:{String(start.getMinutes()).padStart(2, '0')}
        </p>
      </div>

      <MapView tracks={tracks} markers={ends} fitKey={`${id}-${line.length}`} height="40vh" />

      <div className="metrics">
        <div className="metric">
          <div className="v num">
            {fmtKm(activity.distanceM)}
            <small>km</small>
          </div>
          <div className="l">Distancia</div>
        </div>
        <div className="metric">
          <div className="v num">
            {fmt(activity.ascentM)}
            <small>m</small>
          </div>
          <div className="l">Desnivel +</div>
        </div>
        <div className="metric">
          <div className="v num">{fmtDuration(activity.movingSec)}</div>
          <div className="l">En movimiento</div>
        </div>
        <div className="metric">
          <div className="v num">
            {s.usesPace ? fmtPace(activity.distanceM, activity.movingSec) : fmtSpeed(activity.distanceM, activity.movingSec)}
            <small>{s.usesPace ? '/km' : 'km/h'}</small>
          </div>
          <div className="l">{s.usesPace ? 'Ritmo medio' : 'Velocidad media'}</div>
        </div>
        <div className="metric">
          <div className="v num">
            {activity.maxEle === null ? '–' : fmt(activity.maxEle)}
            <small>m</small>
          </div>
          <div className="l">Altitud máx.</div>
        </div>
        <div className="metric">
          <div className="v num">
            {fmt(activity.kcal)}
            <small>kcal</small>
          </div>
          <div className="l">Gasto estimado</div>
        </div>
      </div>
      <p className="xs muted num">
        Tiempo total {fmtDuration(activity.elapsedSec)} · descenso {fmt(activity.descentM)} m
        {activity.minEle !== null ? ` · altitud mín. ${fmt(activity.minEle)} m` : ''}
        {vam !== null ? ` · velocidad de ascenso ${fmt(vam)} m/h` : ''}
      </p>

      {points === null ? (
        <Spinner label="Cargando recorrido…" />
      ) : (
        <>
          {prof.length > 1 && (
            <div className="card col">
              <h2 className="card-title">Perfil de altitud</h2>
              <ProfileChart data={prof} />
              <p className="xs muted">
                {activity.eleSource === 'terrain' ? 'Altitudes ajustadas con el modelo de terreno.' : 'Altitudes medidas por el GPS del teléfono (sin conexión al terminar la salida).'}
              </p>
            </div>
          )}
          {parts.length > 0 && (
            <div className="card">
              <h2 className="card-title">Parciales por kilómetro</h2>
              <div className="nutri-table" style={{ marginTop: 6 }}>
                {parts.map((p) => (
                  <div className="r num" key={p.km}>
                    <span>{p.distanceM >= 995 ? `Km ${p.km}` : `Últimos ${fmt(p.distanceM)} m`}</span>
                    <span>
                      <b>{s.usesPace ? `${fmtPace(p.distanceM, p.sec)} /km` : `${fmtSpeed(p.distanceM, p.sec)} km/h`}</b>
                      {p.eleChange !== null && <span className="muted"> · {p.eleChange >= 0 ? '+' : '−'}{fmt(Math.abs(p.eleChange))} m</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {confirm && (
        <Sheet title="¿Eliminar esta actividad?" onClose={() => setConfirm(false)}>
          <p className="small muted">Se borrarán su recorrido y sus estadísticas. Esta acción no se puede deshacer.</p>
          <button
            className="btn danger"
            onClick={() => {
              removeActivity(activity.id);
              void deleteTrack(activity.id);
              showToast('Actividad eliminada');
              back();
            }}
          >
            Eliminar
          </button>
          <button className="btn secondary" onClick={() => setConfirm(false)}>
            Cancelar
          </button>
        </Sheet>
      )}
    </div>
  );
}
