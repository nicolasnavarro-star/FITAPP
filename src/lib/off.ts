import type { Food } from './types';

/** Open Food Facts: base de datos abierta y gratuita de productos envasados. */
const BASE = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,product_name_es,generic_name,brands,nutriments,serving_quantity,serving_size,quantity';

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
  return {
    id: `off-${p.code ?? name}`,
    name,
    brand: p.brands?.split(',')[0]?.trim() || undefined,
    kcal: Math.round(kcal),
    protein: r1(num(n['proteins_100g'])),
    carbs: r1(num(n['carbohydrates_100g'])),
    fat: r1(num(n['fat_100g'])),
    unit: isLiquid ? 'ml' : 'g',
    portion: serving && serving > 0 ? { label: '1 porción', grams: serving } : undefined,
    barcode: p.code,
    source: 'off',
  };
}

async function getJson(url: string, timeoutMs = 15000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
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

export async function lookupBarcode(code: string): Promise<BarcodeResult> {
  const data = (await getJson(`${BASE}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`)) as {
    status?: number;
    product?: OffProduct;
  } | null;
  if (!data || data.status !== 1 || !data.product) return { status: 'not_found' };
  const food = mapOffProduct({ ...data.product, code });
  if (food) return { status: 'found', food };
  const name = (data.product.product_name_es || data.product.product_name || '').trim();
  return name ? { status: 'incomplete', name } : { status: 'not_found' };
}

export async function searchOnline(query: string): Promise<Food[]> {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '30',
    lc: 'es',
    fields: FIELDS,
  });
  const data = (await getJson(`${BASE}/cgi/search.pl?${params}`, 25000)) as { products?: OffProduct[] } | null;
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
