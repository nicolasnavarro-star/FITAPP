import type { Food } from './types';

/**
 * Open Food Facts: base de datos abierta y gratuita de productos envasados.
 *
 * En 2026 el servicio cambió la forma de entregar los datos nutricionales: la API nueva (v3.5 en adelante)
 * los trae en `nutrition.aggregated_set` y deja vacío el objeto histórico `nutriments`, que solo llena la API v2.
 * Aquí se leen las dos formas, para que un producto no aparezca "sin datos" por culpa del formato.
 */
const BASE = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,product_name_es,generic_name,brands,nutrition,nutriments,serving_quantity,serving_size,quantity,image_front_small_url,image_small_url';

interface OffNutrient {
  value?: number | string;
  value_computed?: number | string;
}

export interface OffProduct {
  code?: string;
  product_name?: unknown;
  product_name_es?: unknown;
  generic_name?: unknown;
  brands?: unknown;
  /** Formato histórico: claves como "energy-kcal_100g". */
  nutriments?: Record<string, number | string | undefined>;
  /** Formato nuevo: valores normalizados por 100 g o 100 ml. */
  nutrition?: { aggregated_set?: { per?: string; nutrients?: Record<string, OffNutrient | undefined> } };
  serving_quantity?: number | string;
  serving_size?: string;
  quantity?: string;
  image_front_small_url?: string;
  image_small_url?: string;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return isFinite(n) ? n : null;
}

/** Los textos pueden venir como cadena, como lista o como objeto por idioma según el servicio. */
function text(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) return text(v[0]);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return text(o.es ?? o.main ?? Object.values(o).find((x) => typeof x === 'string' && x.trim() !== ''));
  }
  return '';
}

/** Valor de un nutriente por 100 g/ml, leyendo primero el formato nuevo y después el histórico. */
function nutrient(p: OffProduct, id: string): number | null {
  const set = p.nutrition?.aggregated_set;
  const entry = set?.nutrients?.[id];
  let value = num(entry?.value) ?? num(entry?.value_computed);
  if (value !== null && set?.per === 'serving') {
    const serving = num(p.serving_quantity);
    value = serving && serving > 0 ? (value * 100) / serving : null;
  }
  return value ?? num(p.nutriments?.[`${id}_100g`]);
}

export function mapOffProduct(p: OffProduct): Food | null {
  const name = text(p.product_name_es) || text(p.product_name) || text(p.generic_name);
  let kcal = nutrient(p, 'energy-kcal');
  if (kcal === null) {
    const kj = nutrient(p, 'energy-kj') ?? nutrient(p, 'energy');
    if (kj !== null) kcal = kj / 4.184;
  }
  if (!name || kcal === null) return null;

  const isLiquid = p.nutrition?.aggregated_set?.per === '100ml' || /\d\s*(ml|cl|l)\b/i.test(`${p.serving_size ?? ''} ${p.quantity ?? ''}`);
  const serving = num(p.serving_quantity);
  const r1 = (v: number | null) => Math.round((v ?? 0) * 10) / 10;
  const opt = (v: number | null) => (v === null || v < 0 ? undefined : Math.round(v * 10) / 10);
  const salt = nutrient(p, 'salt');
  const sodiumG = nutrient(p, 'sodium') ?? (salt !== null ? salt / 2.5 : null);
  const image = p.image_front_small_url || p.image_small_url;
  return {
    id: `off-${p.code ?? name}`,
    name,
    brand: text(typeof p.brands === 'string' ? p.brands.split(',')[0] : p.brands) || undefined,
    kcal: Math.round(kcal),
    protein: r1(nutrient(p, 'proteins')),
    carbs: r1(nutrient(p, 'carbohydrates')),
    fat: r1(nutrient(p, 'fat')),
    unit: isLiquid ? 'ml' : 'g',
    fiber: opt(nutrient(p, 'fiber')),
    sugars: opt(nutrient(p, 'sugars')),
    satFat: opt(nutrient(p, 'saturated-fat')),
    sodium: sodiumG === null || sodiumG < 0 ? undefined : Math.round(sodiumG * 1000),
    image: typeof image === 'string' && /^https:\/\//.test(image) ? image : undefined,
    portion: serving && serving > 0 ? { label: '1 porción', grams: serving } : undefined,
    barcode: p.code,
    source: 'off',
  };
}

/** Consulta JSON. Devuelve el estado HTTP junto con el cuerpo; lanza un error solo si no hay respuesta. */
async function getJson(url: string, timeoutMs = 15000, outer?: AbortSignal): Promise<{ status: number; data: unknown }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  outer?.addEventListener('abort', () => ctrl.abort(), { once: true });
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* respuesta sin JSON */
    }
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Formas equivalentes de un mismo código: los envases con UPC de 12 dígitos se guardan a veces
 * como EAN-13 con un cero delante, y al revés.
 */
export function barcodeVariants(code: string): string[] {
  const digits = code.replace(/\D/g, '');
  const out = [digits];
  if (digits.length === 12) out.push(`0${digits}`);
  if (digits.length === 13 && digits.startsWith('0')) out.push(digits.slice(1));
  if (digits.length === 14 && digits.startsWith('0')) out.push(digits.slice(1));
  return out;
}

type Fetched = { found: false } | { found: true; product: OffProduct };

/** Lee un producto con la API nueva y, si esa no responde bien, con la histórica. */
async function fetchProduct(code: string): Promise<Fetched> {
  const id = encodeURIComponent(code);
  let fromNew: OffProduct | null = null;
  let newAnswered = false;
  try {
    const r = await getJson(`${BASE}/api/v3.6/product/${id}?fields=${FIELDS}`);
    const d = r.data as { product?: OffProduct; result?: { id?: string } } | null;
    if (r.status === 404 || d?.result?.id === 'product_not_found') newAnswered = true;
    else if (r.status === 200 && d?.product) {
      newAnswered = true;
      fromNew = d.product;
    }
  } catch {
    /* se intenta con la API histórica */
  }
  if (fromNew && mapOffProduct({ ...fromNew, code })) return { found: true, product: fromNew };

  // La API histórica sirve de respaldo y además entrega los valores en el formato antiguo.
  try {
    const r = await getJson(`${BASE}/api/v2/product/${id}.json?fields=${FIELDS}`);
    const d = r.data as { status?: number | string; product?: OffProduct } | null;
    if (r.status === 200 && d?.product && (d.status === 1 || d.status === 'success' || d.status === undefined)) {
      // Se combinan ambas respuestas: cada una puede traer datos que a la otra le faltan.
      return { found: true, product: { ...fromNew, ...d.product, nutrition: fromNew?.nutrition ?? d.product.nutrition } };
    }
    if (fromNew) return { found: true, product: fromNew };
    if (r.status === 404 || r.status === 200 || newAnswered) return { found: false };
    throw new Error(`Open Food Facts respondió ${r.status}`);
  } catch (e) {
    if (fromNew) return { found: true, product: fromNew };
    if (newAnswered) return { found: false };
    throw e;
  }
}

export type BarcodeResult = { status: 'found'; food: Food } | { status: 'not_found' } | { status: 'incomplete'; name: string };

export async function lookupBarcode(code: string): Promise<BarcodeResult> {
  let incomplete: string | null = null;
  for (const variant of barcodeVariants(code)) {
    const res = await fetchProduct(variant);
    if (!res.found) continue;
    const food = mapOffProduct({ ...res.product, code });
    if (food) return { status: 'found', food };
    incomplete ??= text(res.product.product_name_es) || text(res.product.product_name) || text(res.product.generic_name) || null;
  }
  return incomplete ? { status: 'incomplete', name: incomplete } : { status: 'not_found' };
}

/** Busca productos por nombre. El buscador histórico falla a ratos, así que hay un segundo buscador de respaldo. */
export async function searchOnline(query: string, signal?: AbortSignal): Promise<Food[]> {
  let products: OffProduct[] = [];
  let failures = 0;
  try {
    const params = new URLSearchParams({ search_terms: query, search_simple: '1', action: 'process', json: '1', page_size: '30', lc: 'es', sort_by: 'unique_scans_n', fields: FIELDS });
    const r = await getJson(`${BASE}/cgi/search.pl?${params}`, 20000, signal);
    const list = (r.data as { products?: OffProduct[] } | null)?.products;
    if (r.status === 200 && Array.isArray(list)) products = list;
    else failures++;
  } catch {
    if (signal?.aborted) throw new Error('cancelado');
    failures++;
  }
  if (products.length === 0) {
    try {
      const params = new URLSearchParams({ q: query, langs: 'es,en', page_size: '30', fields: FIELDS });
      const r = await getJson(`https://search.openfoodfacts.org/search?${params}`, 20000, signal);
      const list = (r.data as { hits?: OffProduct[] } | null)?.hits;
      if (r.status === 200 && Array.isArray(list)) products = list;
      else failures++;
    } catch {
      if (signal?.aborted) throw new Error('cancelado');
      failures++;
    }
  }
  if (products.length === 0 && failures === 2) throw new Error('Los buscadores de Open Food Facts no respondieron');
  const seen = new Set<string>();
  const out: Food[] = [];
  for (const p of products) {
    const food = mapOffProduct(p);
    if (!food) continue;
    const key = `${food.name}|${food.brand}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(food);
  }
  return out;
}
