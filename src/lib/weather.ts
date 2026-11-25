/** Clima de Open-Meteo: servicio gratuito, sin clave. */

export interface WeatherHour {
  time: string;
  temp: number;
  /** Probabilidad de precipitación (%). */
  pop: number;
  code: number;
  wind: number;
  uv: number;
}

export interface Weather {
  fetchedAt: number;
  lat: number;
  lon: number;
  /** Altitud del lugar según el modelo de terreno (m). */
  elevation: number;
  temp: number;
  feels: number;
  code: number;
  wind: number;
  gusts: number;
  humidity: number;
  sunrise: string;
  sunset: string;
  tMax: number;
  tMin: number;
  uvMax: number;
  hours: WeatherHour[];
}

/** Códigos WMO → descripción y tipo de ícono. */
export function describeWeather(code: number): { label: string; kind: 'clear' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm' } {
  if (code === 0) return { label: 'Despejado', kind: 'clear' };
  if (code === 1) return { label: 'Mayormente despejado', kind: 'partly' };
  if (code === 2) return { label: 'Parcialmente nublado', kind: 'partly' };
  if (code === 3) return { label: 'Nublado', kind: 'cloud' };
  if (code === 45 || code === 48) return { label: 'Niebla', kind: 'fog' };
  if (code >= 51 && code <= 57) return { label: 'Llovizna', kind: 'rain' };
  if (code >= 61 && code <= 67) return { label: code >= 65 ? 'Lluvia fuerte' : 'Lluvia', kind: 'rain' };
  if (code >= 71 && code <= 77) return { label: 'Nieve', kind: 'snow' };
  if (code >= 80 && code <= 82) return { label: 'Chubascos', kind: 'rain' };
  if (code === 85 || code === 86) return { label: 'Chubascos de nieve', kind: 'snow' };
  if (code >= 95) return { label: 'Tormenta eléctrica', kind: 'storm' };
  return { label: 'Variable', kind: 'cloud' };
}

/** Avisos simples para decidir si conviene salir al cerro. */
export function weatherAlerts(w: Weather): string[] {
  const out: string[] = [];
  const next = w.hours.slice(0, 6);
  if (next.some((h) => h.code >= 95)) out.push('Tormenta eléctrica en las próximas horas: evita cumbres y filos.');
  else if (next.some((h) => h.pop >= 60)) out.push('Alta probabilidad de precipitación en las próximas horas.');
  if (w.gusts >= 50) out.push(`Rachas de viento de ${Math.round(w.gusts)} km/h.`);
  if (w.uvMax >= 8) out.push(`Índice UV muy alto (${Math.round(w.uvMax)}): bloqueador, gorro y lentes.`);
  if (w.tMax >= 30) out.push('Calor intenso: lleva más agua de la habitual y sal temprano.');
  if (w.temp <= 2) out.push('Temperatura cercana a cero: abrígate por capas.');
  return out;
}

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && isFinite(v) ? v : fallback);

export async function fetchWeather(lat: number, lon: number): Promise<Weather> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,relative_humidity_2m',
    hourly: 'temperature_2m,precipitation_probability,weather_code,wind_speed_10m,uv_index',
    daily: 'sunrise,sunset,temperature_2m_max,temperature_2m_min,uv_index_max',
    forecast_days: '2',
    timezone: 'auto',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo respondió ${res.status}`);
  const d = (await res.json()) as {
    elevation?: number;
    current?: Record<string, unknown>;
    hourly?: Record<string, unknown[]>;
    daily?: Record<string, unknown[]>;
  };
  const cur = d.current ?? {};
  const hourly = d.hourly ?? {};
  const daily = d.daily ?? {};
  const times = (hourly.time ?? []) as string[];
  // Las horas vienen en hora local del lugar; se muestran desde la hora actual en adelante.
  const nowKey = String(cur.time ?? '').slice(0, 13);
  let start = times.findIndex((t) => t.slice(0, 13) >= nowKey);
  if (start < 0) start = 0;
  const hours: WeatherHour[] = [];
  for (let i = start; i < Math.min(times.length, start + 12); i++) {
    hours.push({
      time: times[i].slice(11, 16),
      temp: num(hourly.temperature_2m?.[i]),
      pop: num(hourly.precipitation_probability?.[i]),
      code: num(hourly.weather_code?.[i]),
      wind: num(hourly.wind_speed_10m?.[i]),
      uv: num(hourly.uv_index?.[i]),
    });
  }
  return {
    fetchedAt: Date.now(),
    lat,
    lon,
    elevation: num(d.elevation),
    temp: num(cur.temperature_2m),
    feels: num(cur.apparent_temperature),
    code: num(cur.weather_code),
    wind: num(cur.wind_speed_10m),
    gusts: num(cur.wind_gusts_10m),
    humidity: num(cur.relative_humidity_2m),
    sunrise: String(daily.sunrise?.[0] ?? '').slice(11, 16),
    sunset: String(daily.sunset?.[0] ?? '').slice(11, 16),
    tMax: num(daily.temperature_2m_max?.[0]),
    tMin: num(daily.temperature_2m_min?.[0]),
    uvMax: num(daily.uv_index_max?.[0]),
    hours,
  };
}
