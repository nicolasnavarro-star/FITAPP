import type { Food } from './types';

/** Open Food Facts: base de datos abierta y gratuita de productos envasados. */
const BASE = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,product_name_es,generic_name,brands,nutriments,serving_quantity,serving_size,quantity,image_front_small_url,image_small_url';

interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_es?: string;
  generic_name?: string;
  brands?: string;
  nutriments?: Record<string, number | string | undefined>;
  serving_quantity?: number | string;
  serving_size?: string;
  quantity?: string;
  image_front_small_url?: string;
  image_small_url?: string;
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return isFinite(n) ? n : null;
}

export function mapOffProduct(p: OffProduct): Food | null {
  const name = (p.product_name_es || p.product_name || p.generic_name || '').trim();
  const n = p.nutriments ?? {};
  let kcal = num(n['energy-kcal_100g']);
  if (kcal === null) {
    const kj = num(n['energy_100g']) ?? num(n['energy-kj_100g']);
    if (kj !== null) kcal = kj / 4.184;
  }
  if (!name || kcal === null) return null;

  const isLiquid = /\d\s*(ml|cl|l)\b/i.test(`${p.serving_size ?? ''} ${p.quantity ?? ''}`);
  const serving = num(p.serving_quantity);
  const r1 = (v: number | null) => Math.round((v ?? 0) * 10) / 10;
  const opt = (v: number | null) => (v === null || v < 0 ? undefined : Math.round(v * 10) / 10);
  const sodiumG = num(n['sodium_100g']) ?? (num(n['salt_100g']) !== null ? num(n['salt_100g'])! / 2.5 : null);
  const image = p.image_front_small_url || p.image_small_url;
  return {
    id: `off-${p.code ?? name}`,
    name,
    brand: p.brands?.split(',')[0]?.trim() || undefined,
    kcal: Math.round(kcal),
    protein: r1(num(n['proteins_100g'])),
    carbs: r1(num(n['carbohydrates_100g'])),
    fat: r1(num(n['fat_100g'])),
    unit: isLiquid ? 'ml' : 'g',
    fiber: opt(num(n['fiber_100g'])),
    sugars: opt(num(n['sugars_100g'])),
    satFat: opt(num(n['saturated-fat_100g'])),
    sodium: sodiumG === null || sodiumG < 0 ? undefined : Math.round(sodiumG * 1000),
    image: image && /^https:\/\//.test(image) ? image : undefined,
    portion: serving && serving > 0 ? { label: '1 porción', grams: serving } : undefined,
    barcode: p.code,
    source: 'off',
  };
}

async function getJson(url: string, timeoutMs = 15000, outer?: AbortSignal): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  outer?.addEventListener('abort', () => ctrl.abort(), { once: true });
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Open Food Facts respondió ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export type BarcodeResult = { status: 'found'; food: Food } | { status: 'not_found' } | { status: 'incomplete'; name: string };

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

export async function lookupBarcode(code: string): Promise<BarcodeResult> {
  let incomplete: string | null = null;
  for (const variant of barcodeVariants(code)) {
    const data = (await getJson(`${BASE}/api/v2/product/${encodeURIComponent(variant)}.json?fields=${FIELDS}`)) as {
      status?: number;
      product?: OffProduct;
    } | null;
    if (!data || data.status !== 1 || !data.product) continue;
    const food = mapOffProduct({ ...data.product, code });
    if (food) return { status: 'found', food };
    incomplete ??= (data.product.product_name_es || data.product.product_name || '').trim() || null;
  }
  return incomplete ? { status: 'incomplete', name: incomplete } : { status: 'not_found' };
}

export async function searchOnline(query: string, signal?: AbortSignal): Promise<Food[]> {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '30',
    lc: 'es',
    sort_by: 'unique_scans_n',
    fields: FIELDS,
  });
  const data = (await getJson(`${BASE}/cgi/search.pl?${params}`, 25000, signal)) as { products?: OffProduct[] } | null;
  const seen = new Set<string>();
  const out: Food[] = [];
  for (const p of data?.products ?? []) {
    const food = mapOffProduct(p);
    if (!food) continue;
    const key = `${food.name}|${food.brand}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(food);
  }
  return out;
}
