export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function toDateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, n: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return toDateKey(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDateKey(b).getTime() - parseDateKey(a).getTime()) / 86400000);
}

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function weekdayShort(key: string): string {
  return WEEKDAYS[parseDateKey(key).getDay()];
}

export function formatDate(key: string, withYear = false): string {
  const d = parseDateKey(key);
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return withYear ? `${base} ${d.getFullYear()}` : base;
}

export function friendlyDate(key: string): string {
  const today = todayKey();
  if (key === today) return 'Hoy';
  if (key === addDays(today, -1)) return 'Ayer';
  if (key === addDays(today, 1)) return 'Mañana';
  return `${weekdayShort(key)} ${formatDate(key)}`;
}

/** Número con coma decimal y sin ceros sobrantes. */
export function fmt(n: number, decimals = 0): string {
  if (!isFinite(n)) return '0';
  const f = 10 ** decimals;
  const r = Math.round(n * f) / f;
  return r.toLocaleString('es-CL', { maximumFractionDigits: decimals });
}

/** Acepta coma o punto decimal; devuelve null si no es un número válido. */
export function parseNum(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return isFinite(n) ? n : null;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Normaliza texto para búsquedas: minúsculas y sin tildes. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
