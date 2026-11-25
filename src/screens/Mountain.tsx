import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, MapPinned, Play, RefreshCw, Route, Sun, Sunrise, Sunset, TriangleAlert, Wind } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import RouteThumb from '../components/RouteThumb';
import { Spinner } from '../components/ui';
import { type Sport, SPORTS, fmtDuration, fmtKm } from '../lib/geo';
import { LocationError, currentLocation } from '../lib/location';
import { restoreRecording, startRecording, useRec } from '../lib/recorder';
import { type Weather, describeWeather, fetchWeather, weatherAlerts } from '../lib/weather';
import { fmt, formatDate, toDateKey } from '../lib/util';
import { push } from '../router';
import { useStore, useUi } from '../store';

const ICONS = { clear: Sun, partly: CloudSun, cloud: Cloud, fog: CloudFog, rain: CloudRain, snow: CloudSnow, storm: CloudLightning };

function WeatherIcon({ code, size = 22 }: { code: number; size?: number }) {
  const Icon = ICONS[describeWeather(code).kind];
  return <Icon size={size} />;
}

// El clima se conserva unos minutos para no consultarlo cada vez que se abre la pestaña.
let cache: Weather | null = null;

function WeatherCard() {
  const lastLoc = useStore((s) => s.lastLoc);
  const setLastLoc = useStore((s) => s.setLastLoc);
  const [weather, setWeather] = useState<Weather | null>(cache);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  const load = useCallback(
    async (locate: boolean) => {
      setState('loading');
      setMsg('');
      let loc = lastLoc;
      if (locate || !loc) {
        try {
          const fix = await currentLocation();
          loc = { lat: fix.lat, lon: fix.lon };
          setLastLoc(fix.lat, fix.lon);
        } catch (e) {
          if (!loc) {
            setState('error');
            setMsg(e instanceof LocationError ? e.message : 'No se pudo obtener tu ubicación.');
            return;
          }
        }
      }
      try {
        const w = await fetchWeather(loc.lat, loc.lon);
        cache = w;
        setWeather(w);
        setState('idle');
      } catch {
        setState('error');
        setMsg('No se pudo cargar el clima. Revisa tu conexión.');
      }
    },
    [lastLoc, setLastLoc],
  );

  useEffect(() => {
    if (!cache || Date.now() - cache.fetchedAt > 20 * 60000) void load(false);
    // Solo al abrir la pestaña.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!weather) {
    return (
      <div className="card col">
        <h2 className="card-title">Clima</h2>
        {state === 'loading' ? (
          <Spinner label="Consultando el clima de tu zona…" />
        ) : (
          <>
            <p className="small muted">{msg || 'Activa la ubicación para ver el clima de donde estás.'}</p>
            <button className="btn sm secondary" onClick={() => void load(true)}>
              <MapPinned size={18} /> Usar mi ubicación
            </button>
          </>
        )}
      </div>
    );
  }

  const alerts = weatherAlerts(weather);
  return (
    <div className="card col" style={{ gap: 12 }}>
      <div className="row">
        <span className="meal-icon" style={{ ['--tone' as string]: 'var(--gold)' }}>
          <WeatherIcon code={weather.code} size={24} />
        </span>
        <div className="grow">
          <p className="num" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>
            {Math.round(weather.temp)}°<span className="small muted" style={{ fontWeight: 700, letterSpacing: 0 }}> sensación {Math.round(weather.feels)}°</span>
          </p>
          <p className="small muted num">
            {describeWeather(weather.code).label} · {fmt(weather.elevation)} m s. n. m.
          </p>
        </div>
        <button className="icon-btn" aria-label="Actualizar clima" disabled={state === 'loading'} onClick={() => void load(true)}>
          <RefreshCw size={18} />
        </button>
      </div>
      <div className="row spread small num" style={{ flexWrap: 'wrap' }}>
        <span className="row" style={{ gap: 6 }}>
          <Wind size={16} color="var(--text-3)" /> {Math.round(weather.wind)} km/h · rachas {Math.round(weather.gusts)}
        </span>
        <span className="row" style={{ gap: 6 }}>
          <Sunrise size={16} color="var(--text-3)" /> {weather.sunrise}
        </span>
        <span className="row" style={{ gap: 6 }}>
          <Sunset size={16} color="var(--text-3)" /> {weather.sunset}
        </span>
      </div>
      <div className="hours" aria-label="Pronóstico por hora">
        {weather.hours.map((h) => (
          <div className="hour num" key={h.time}>
            <span className="t">{h.time}</span>
            <WeatherIcon code={h.code} size={18} />
            <span>{Math.round(h.temp)}°</span>
            <span className="p">{Math.round(h.pop)}%</span>
          </div>
        ))}
      </div>
      <p className="xs muted num">
        Hoy {Math.round(weather.tMin)}° a {Math.round(weather.tMax)}° · UV máx. {Math.round(weather.uvMax)} · humedad {Math.round(weather.humidity)}% · el porcentaje es la probabilidad de
        lluvia
      </p>
      {alerts.map((a) => (
        <div className="notice small row" style={{ alignItems: 'flex-start' }} key={a}>
          <TriangleAlert size={17} color="var(--gold)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{a}</span>
        </div>
      ))}
      {state === 'error' && <p className="xs muted">{msg}</p>}
    </div>
  );
}

export default function Mountain() {
  const activities = useStore((s) => s.activities);
  const routes = useStore((s) => s.routes);
  const showToast = useUi((s) => s.showToast);
  const status = useRec((s) => s.status);
  const recSport = useRec((s) => s.sport);
  const recStats = useRec((s) => s.stats);
  const [sport, setSport] = useState<Sport>('hike');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    void restoreRecording();
  }, []);

  const start = async () => {
    setStarting(true);
    try {
      await startRecording(sport);
      push('/record');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo iniciar el GPS');
    } finally {
      setStarting(false);
    }
  };

  const monthKey = toDateKey(new Date()).slice(0, 7);
  const month = activities.filter((a) => toDateKey(new Date(a.startedAt)).startsWith(monthKey));
  const sum = (list: typeof activities, f: (a: (typeof activities)[number]) => number) => list.reduce((acc, a) => acc + f(a), 0);
  const best = <K extends 'distanceM' | 'ascentM'>(k: K) => activities.reduce((m, a) => Math.max(m, a[k]), 0);
  const highest = activities.reduce((m, a) => Math.max(m, a.maxEle ?? 0), 0);

  return (
    <div className="screen with-tabs">
      <div className="row spread">
        <h1 className="title-xl">Montaña</h1>
        <button className="btn sm secondary" onClick={() => push('/route-plan')}>
          <Route size={18} /> Trazar ruta
        </button>
      </div>

      <div className="hero col" style={{ gap: 14 }}>
        {status === 'idle' ? (
          <>
            <span className="label">Nueva actividad</span>
            <div className="chips" style={{ margin: 0, padding: 0 }} role="group" aria-label="Tipo de actividad">
              {(Object.keys(SPORTS) as Sport[]).map((s) => (
                <button
                  key={s}
                  className="chip"
                  aria-pressed={sport === s}
                  style={sport === s ? { background: '#f2f2ef', color: '#0d1210' } : { background: 'rgba(255,255,255,0.12)', color: '#fff' }}
                  onClick={() => setSport(s)}
                >
                  {SPORTS[s].label}
                </button>
              ))}
            </div>
            <button className="btn" disabled={starting} onClick={() => void start()}>
              <Play size={18} /> {starting ? 'Buscando GPS…' : 'Iniciar actividad'}
            </button>
            <p className="xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Registra distancia, desnivel, ritmo y tu recorrido en el mapa, también con la pantalla apagada.
            </p>
          </>
        ) : (
          <>
            <span className="label">{status === 'paused' ? 'Actividad en pausa' : 'Grabando'}</span>
            <h2 className="num" style={{ fontSize: 26, fontWeight: 800 }}>
              {SPORTS[recSport].label} · {fmtKm(recStats.distanceM)} km · +{fmt(recStats.ascentM)} m
            </h2>
            <button className="btn" onClick={() => push('/record')}>
              <Play size={18} /> Volver a la actividad
            </button>
          </>
        )}
      </div>

      <WeatherCard />

      <h2 className="section-title">Este mes</h2>
      <div className="metrics">
        <div className="metric">
          <div className="v num">
            {fmtKm(sum(month, (a) => a.distanceM))}
            <small>km</small>
          </div>
          <div className="l">Distancia</div>
        </div>
        <div className="metric">
          <div className="v num">
            {fmt(sum(month, (a) => a.ascentM))}
            <small>m</small>
          </div>
          <div className="l">Desnivel +</div>
        </div>
        <div className="metric">
          <div className="v num">{month.length}</div>
          <div className="l">{month.length === 1 ? 'Salida' : 'Salidas'}</div>
        </div>
      </div>
      {activities.length > 0 && (
        <p className="xs muted num">
          Tus marcas: salida más larga {fmtKm(best('distanceM'))} km · mayor desnivel +{fmt(best('ascentM'))} m{highest > 0 ? ` · punto más alto ${fmt(highest)} m` : ''}
        </p>
      )}

      {routes.length > 0 && (
        <>
          <h2 className="section-title">Mis rutas</h2>
          <div className="card" style={{ paddingTop: 6, paddingBottom: 6 }}>
            <div className="list">
              {routes.map((r) => (
                <button className="list-item" key={r.id} onClick={() => push(`/route?id=${r.id}`)}>
                  <RouteThumb points={r.preview} planned />
                  <div className="grow">
                    <div className="name">{r.name}</div>
                    <div className="sub num">
                      {fmtKm(r.distanceM)} km · +{fmt(r.ascentM)} m
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <h2 className="section-title">Actividades</h2>
      <div className="card" style={{ paddingTop: 6, paddingBottom: 6 }}>
        {activities.length > 0 ? (
          <div className="list">
            {activities.map((a) => (
              <button className="list-item" key={a.id} onClick={() => push(`/activity?id=${a.id}`)}>
                <RouteThumb points={a.preview} />
                <div className="grow">
                  <div className="name">{a.name}</div>
                  <div className="sub num">
                    {formatDate(toDateKey(new Date(a.startedAt)), true)} · {fmtKm(a.distanceM)} km · +{fmt(a.ascentM)} m · {fmtDuration(a.movingSec)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="empty">Tus salidas aparecerán aquí con su recorrido, desnivel y tiempos.</p>
        )}
      </div>
    </div>
  );
}
