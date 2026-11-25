import { Flag, Pause, Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import MapView, { type MapTrack } from '../components/MapView';
import { Header, Sheet, Spinner } from '../components/ui';
import { type LatLon, SPORTS, fmtDuration, fmtKm, fmtPace, fmtSpeed } from '../lib/geo';
import { discardRecording, finishRecording, pauseRecording, resumeRecording, useRec } from '../lib/recorder';
import { loadTrack } from '../lib/tracks';
import { fmt } from '../lib/util';
import { back, replace } from '../router';
import { useCurrentWeight, useUi } from '../store';

export default function Record() {
  const rec = useRec();
  const weight = useCurrentWeight();
  const showToast = useUi((s) => s.showToast);
  const [now, setNow] = useState(Date.now());
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [planned, setPlanned] = useState<LatLon[]>([]);
  const leaving = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (rec.status === 'idle' && !leaving.current) back();
  }, [rec.status]);

  useEffect(() => {
    if (!rec.routeId) return;
    void loadTrack(`route-${rec.routeId}`).then((pts) => setPlanned(pts.map((p) => [p[1], p[2]])));
  }, [rec.routeId]);

  const trackPoints = useMemo<LatLon[]>(() => rec.points.map((p) => [p[1], p[2]]), [rec.points]);
  const tracks = useMemo<MapTrack[]>(() => [...(planned.length > 1 ? [{ points: planned, planned: true }] : []), { points: trackPoints }], [planned, trackPoints]);
  const position = useMemo<LatLon | null>(() => (rec.last ? [rec.last.lat, rec.last.lon] : null), [rec.last]);

  if (rec.status === 'idle') return null;

  const { stats, sport } = rec;
  const s = SPORTS[sport];
  const elapsed = Math.max(0, (now - rec.startedAt) / 1000);
  const acc = rec.last?.acc ?? null;
  const gps = acc === null ? { cls: '', text: 'Buscando GPS' } : acc <= 15 ? { cls: 'good', text: `GPS ±${Math.round(acc)} m` } : acc <= 40 ? { cls: 'weak', text: `GPS ±${Math.round(acc)} m` } : { cls: 'weak', text: 'Señal débil' };
  const altitude = rec.last?.ele ?? stats.maxEle;
  const vam = stats.movingSec > 120 ? Math.round(stats.ascentM / (stats.movingSec / 3600)) : null;

  const finish = async () => {
    setSaving(true);
    leaving.current = true;
    const activity = await finishRecording(weight);
    if (activity) {
      showToast('Actividad guardada');
      replace(`/activity?id=${activity.id}`);
    } else {
      showToast('Recorrido demasiado corto: no se guardó');
      back();
    }
  };

  return (
    <>
      <div className="screen with-footer">
        <Header
          title={`${s.label}${rec.status === 'paused' ? ' · en pausa' : ''}`}
          right={
            <span className={`gps-pill num ${gps.cls}`} role="status">
              <i /> {gps.text}
            </span>
          }
        />
        <MapView tracks={tracks} position={position} follow height="38vh" fitKey={planned.length > 1 ? `route-${planned.length}` : undefined} />
        {rec.error && (
          <div className="notice error small" role="alert">
            {rec.error}
          </div>
        )}
        <div className="metrics two">
          <div className="metric big">
            <div className="v num">{fmtDuration(stats.movingSec)}</div>
            <div className="l">Tiempo en movimiento</div>
          </div>
          <div className="metric big">
            <div className="v num">
              {fmtKm(stats.distanceM)}
              <small>km</small>
            </div>
            <div className="l">Distancia</div>
          </div>
        </div>
        <div className="metrics">
          <div className="metric">
            <div className="v num">
              {fmt(stats.ascentM)}
              <small>m</small>
            </div>
            <div className="l">Desnivel +</div>
          </div>
          <div className="metric">
            <div className="v num">
              {altitude === null || altitude === undefined ? '–' : fmt(altitude)}
              <small>m</small>
            </div>
            <div className="l">Altitud</div>
          </div>
          <div className="metric">
            <div className="v num">
              {s.usesPace ? fmtPace(stats.distanceM, stats.movingSec) : fmtSpeed(stats.distanceM, stats.movingSec)}
              <small>{s.usesPace ? '/km' : 'km/h'}</small>
            </div>
            <div className="l">{s.usesPace ? 'Ritmo' : 'Velocidad'}</div>
          </div>
        </div>
        <p className="xs muted num center">
          Tiempo total {fmtDuration(elapsed)} · descenso {fmt(stats.descentM)} m{vam !== null ? ` · ${fmt(vam)} m/h de ascenso` : ''}
        </p>
      </div>

      <div className="footer-bar">
        <div className="rec-controls">
          {rec.status === 'recording' ? (
            <button className="btn secondary" onClick={pauseRecording}>
              <Pause size={18} /> Pausar
            </button>
          ) : (
            <button className="btn secondary" onClick={() => void resumeRecording()}>
              <Play size={18} /> Reanudar
            </button>
          )}
          <button className="btn" onClick={() => setConfirm(true)}>
            <Flag size={18} /> Finalizar
          </button>
        </div>
      </div>

      {confirm && (
        <Sheet title="¿Terminar la actividad?" onClose={() => !saving && setConfirm(false)}>
          {saving ? (
            <Spinner label="Guardando y calculando el desnivel…" />
          ) : (
            <>
              <p className="small muted num">
                {fmtKm(stats.distanceM)} km · +{fmt(stats.ascentM)} m · {fmtDuration(stats.movingSec)} en movimiento
              </p>
              <button className="btn" onClick={() => void finish()}>
                Guardar actividad
              </button>
              <button className="btn secondary" onClick={() => setConfirm(false)}>
                Seguir grabando
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  leaving.current = true;
                  void discardRecording();
                  showToast('Actividad descartada');
                  back();
                }}
              >
                Descartar
              </button>
            </>
          )}
        </Sheet>
      )}
    </>
  );
}
