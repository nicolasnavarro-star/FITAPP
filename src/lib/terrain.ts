import { createStore, del, get, keys, set } from 'idb-keyval';
import type { LatLon } from './geo';

/**
 * Relieve para usar sin conexión.
 * Usa las teselas "Terrarium" del conjunto abierto Terrain Tiles (AWS Open Data), que codifican la altitud
 * en el color de cada píxel y se pueden descargar y guardar libremente. Con ellas la app dibuja su propio
 * mapa de relieve con curvas de nivel y calcula altitudes sin depender de ningún servicio.
 */

export const TERRAIN_MAX_ZOOM = 14;
export const TERRAIN_MIN_ZOOM = 10;
const SIZE = 256;
const tileStore = createStore('kaizen-tiles', 'tiles');

export interface Bounds {
  s: number;
  w: number;
  n: number;
  e: number;
}

export interface TileId {
  z: number;
  x: number;
  y: number;
}

const terrainUrl = (t: TileId) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${t.z}/${t.x}/${t.y}.png`;
const key = (t: TileId) => `terrain/${t.z}/${t.x}/${t.y}`;

/** Posición fraccionaria de una coordenada en la cuadrícula de teselas de un nivel de zoom. */
export function tilePos(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const clamped = Math.max(-85.0511, Math.min(85.0511, lat));
  const rad = (clamped * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * n };
}

/** Teselas de relieve que cubren una zona en todos los niveles que se descargan. */
export function tilesForBounds(b: Bounds, minZ = TERRAIN_MIN_ZOOM, maxZ = TERRAIN_MAX_ZOOM): TileId[] {
  const out: TileId[] = [];
  for (let z = minZ; z <= maxZ; z++) {
    const a = tilePos(b.n, b.w, z);
    const c = tilePos(b.s, b.e, z);
    for (let x = Math.floor(a.x); x <= Math.floor(c.x); x++) for (let y = Math.floor(a.y); y <= Math.floor(c.y); y++) out.push({ z, x, y });
  }
  return out;
}

/** Altitud en metros codificada en un píxel Terrarium. */
export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

async function readBlob(t: TileId, network: boolean): Promise<Blob | null> {
  const cached = (await get(key(t), tileStore).catch(() => undefined)) as Blob | undefined;
  if (cached) return cached;
  if (!network) return null;
  try {
    const res = await fetch(terrainUrl(t));
    if (!res.ok) return null;
    const blob = await res.blob();
    // Todo lo que se ve con conexión queda guardado para la próxima vez.
    void set(key(t), blob, tileStore).catch(() => undefined);
    return blob;
  } catch {
    return null;
  }
}

async function decode(blob: Blob): Promise<Float32Array> {
  const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, SIZE, SIZE);
  bitmap.close();
  const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
  const out = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < out.length; i++) out[i] = decodeTerrarium(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  return out;
}

// Las teselas decodificadas se conservan en memoria (las más recientes) para no repetir el trabajo.
const grids = new Map<string, Promise<Float32Array | null>>();

function grid(t: TileId, network: boolean): Promise<Float32Array | null> {
  const k = key(t);
  const hit = grids.get(k);
  if (hit) {
    grids.delete(k);
    grids.set(k, hit);
    return hit;
  }
  const p = readBlob(t, network)
    .then((b) => (b ? decode(b) : null))
    .catch(() => null);
  grids.set(k, p);
  void p.then((g) => {
    // Un fallo (por ejemplo, sin conexión) no se recuerda: se reintentará la próxima vez.
    if (!g && grids.get(k) === p) grids.delete(k);
  });
  if (grids.size > 40) grids.delete(grids.keys().next().value as string);
  return p;
}

/** Interpolación bilineal; fuera del borde de la tesela se prolonga la pendiente para no dejar uniones visibles. */
function bilinear(g: Float32Array, px: number, py: number): number {
  const x0 = Math.max(0, Math.min(SIZE - 2, Math.floor(px)));
  const y0 = Math.max(0, Math.min(SIZE - 2, Math.floor(py)));
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const fx = Math.max(-1, Math.min(2, px - x0));
  const fy = Math.max(-1, Math.min(2, py - y0));
  const top = g[y0 * SIZE + x0] * (1 - fx) + g[y0 * SIZE + x1] * fx;
  const bottom = g[y1 * SIZE + x0] * (1 - fx) + g[y1 * SIZE + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

/** Altitud de un punto a partir del relieve (guardado o, si se permite, descargado). Null si no hay datos. */
export async function elevationAt(lat: number, lon: number, network = true): Promise<number | null> {
  for (let z = TERRAIN_MAX_ZOOM; z >= TERRAIN_MIN_ZOOM; z--) {
    const p = tilePos(lat, lon, z);
    const t = { z, x: Math.floor(p.x), y: Math.floor(p.y) };
    // Con conexión basta el nivel más detallado; sin ella se prueba con lo que haya guardado.
    const g = await grid(t, network && z === TERRAIN_MAX_ZOOM);
    if (g) return bilinear(g, (p.x - t.x) * SIZE - 0.5, (p.y - t.y) * SIZE - 0.5);
  }
  return null;
}

export async function elevationsFromTerrain(coords: LatLon[], network = true): Promise<number[]> {
  const out: number[] = [];
  for (const c of coords) {
    const e = await elevationAt(c[0], c[1], network);
    if (e === null) throw new Error('Sin datos de relieve para este punto');
    out.push(Math.round(e * 10) / 10);
  }
  return out;
}

function contourInterval(z: number): { minor: number; major: number } {
  if (z <= 11) return { minor: 100, major: 500 };
  if (z <= 13) return { minor: 50, major: 250 };
  if (z <= 15) return { minor: 20, major: 100 };
  return { minor: 10, major: 50 };
}

/**
 * Dibuja una tesela del mapa de relieve (sombreado de laderas y curvas de nivel) en un lienzo.
 * Para zooms más cercanos que el relieve disponible se interpola, de modo que las curvas salgan nítidas.
 * Devuelve false si no hay datos para esa zona.
 */
export async function drawRelief(canvas: HTMLCanvasElement, t: TileId): Promise<boolean> {
  const nz = Math.min(t.z, TERRAIN_MAX_ZOOM);
  const scale = 2 ** (t.z - nz);
  const parent = { z: nz, x: Math.floor(t.x / scale), y: Math.floor(t.y / scale) };
  let g = await grid(parent, true);
  let src = parent;
  let srcScale = scale;
  // Sin el nivel detallado se usa uno más general, si está guardado.
  for (let z = nz - 1; !g && z >= TERRAIN_MIN_ZOOM; z--) {
    srcScale = 2 ** (t.z - z);
    src = { z, x: Math.floor(t.x / srcScale), y: Math.floor(t.y / srcScale) };
    g = await grid(src, false);
  }
  const ctx = canvas.getContext('2d')!;
  if (!g) {
    ctx.fillStyle = '#e4e2d8';
    ctx.fillRect(0, 0, SIZE, SIZE);
    return false;
  }
  const ox = (t.x - src.x * srcScale) * (SIZE / srcScale);
  const oy = (t.y - src.y * srcScale) * (SIZE / srcScale);
  const step = 1 / srcScale;
  // Tamaño real de un píxel de pantalla, para que la pendiente sea correcta a cualquier zoom y latitud.
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (t.y + 0.5)) / 2 ** t.z)));
  const cell = (40075016.686 * Math.cos(latRad)) / (SIZE * 2 ** t.z);
  // La pendiente se mide sobre unos 24 m de terreno: al acercar el mapa evita el granulado del modelo.
  const span = Math.max(1, Math.min(10, Math.round(24 / cell)));
  const W = SIZE + span;
  const ele = new Float32Array(W * W);
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) ele[j * W + i] = bilinear(g, ox + i * step - 0.5, oy + j * step - 0.5);
  const { minor, major } = contourInterval(t.z);
  const img = ctx.createImageData(SIZE, SIZE);
  const d = img.data;
  for (let j = 0; j < SIZE; j++) {
    for (let i = 0; i < SIZE; i++) {
      const e = ele[j * W + i];
      const ex = ele[j * W + i + 1];
      const ey = ele[(j + 1) * W + i];
      // Sombreado con luz desde el noroeste.
      const dzdx = ((ele[j * W + i + span] - e) / (span * cell)) * 1.25;
      const dzdy = ((ele[(j + span) * W + i] - e) / (span * cell)) * 1.25;
      const shade = (0.5 * dzdx + 0.5 * dzdy + 0.7071) / Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
      const light = 0.68 + 0.42 * Math.max(0, Math.min(1, shade));
      // Tinte según la altitud: verde abajo, tierra y gris hacia las cumbres.
      const h = Math.max(0, Math.min(1, e / 4500));
      let r = (212 + 30 * h) * light;
      let gr = (222 + 8 * h) * light;
      let b = (190 + 46 * h) * light;
      if (e <= 0.5) {
        r = 168;
        gr = 205;
        b = 232;
      } else {
        const band = Math.floor(e / minor);
        if (band !== Math.floor(ex / minor) || band !== Math.floor(ey / minor)) {
          const bandMajor = Math.floor(e / major);
          const strong = bandMajor !== Math.floor(ex / major) || bandMajor !== Math.floor(ey / major);
          const a = strong ? 0.75 : 0.38;
          r = r * (1 - a) + 122 * a;
          gr = gr * (1 - a) + 82 * a;
          b = b * (1 - a) + 44 * a;
        }
      }
      const k = (j * SIZE + i) * 4;
      d[k] = r;
      d[k + 1] = gr;
      d[k + 2] = b;
      d[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return true;
}

/** Descarga y guarda el relieve de una zona. Devuelve cuántas teselas quedaron guardadas y su tamaño. */
export async function downloadTerrain(tiles: TileId[], onProgress: (done: number, total: number) => void, signal?: AbortSignal): Promise<{ saved: number; bytes: number }> {
  let done = 0;
  let saved = 0;
  let bytes = 0;
  let next = 0;
  const worker = async () => {
    while (next < tiles.length && !signal?.aborted) {
      const t = tiles[next++];
      try {
        let blob = (await get(key(t), tileStore)) as Blob | undefined;
        if (!blob) {
          const res = await fetch(terrainUrl(t), { signal });
          if (res.ok) {
            blob = await res.blob();
            await set(key(t), blob, tileStore);
          }
        }
        if (blob) {
          saved++;
          bytes += blob.size;
        }
      } catch {
        /* se cuenta como no descargada */
      }
      onProgress(++done, tiles.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (signal?.aborted) throw new Error('cancelado');
  return { saved, bytes };
}

export async function deleteTerrain(tiles: TileId[]): Promise<void> {
  for (const t of tiles) {
    grids.delete(key(t));
    await del(key(t), tileStore).catch(() => undefined);
  }
}

/* ---------- Caché de mapas en línea ---------- */

/** Guarda o recupera una tesela de un mapa en línea ya visto (por ejemplo, calles o satélite). */
export async function cachedRaster(layer: string, t: TileId, url: string): Promise<Blob | null> {
  const k = `raster/${layer}/${t.z}/${t.x}/${t.y}`;
  const cached = (await get(k, tileStore).catch(() => undefined)) as Blob | undefined;
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) return null;
  const blob = await res.blob();
  void set(k, blob, tileStore).catch(() => undefined);
  return blob;
}

/** Espacio aproximado que ocupan los mapas guardados. */
export async function tileStoreUsage(): Promise<{ tiles: number; bytes: number | null }> {
  const all = await keys(tileStore).catch(() => []);
  let bytes: number | null = null;
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.usage !== undefined) bytes = est.usage;
  } catch {
    /* no disponible */
  }
  return { tiles: all.length, bytes };
}

/** Borra los mapas en línea guardados al navegar (no el relieve descargado). */
export async function clearRasterCache(): Promise<void> {
  const all = await keys(tileStore).catch(() => []);
  for (const k of all) if (typeof k === 'string' && k.startsWith('raster/')) await del(k, tileStore).catch(() => undefined);
}
