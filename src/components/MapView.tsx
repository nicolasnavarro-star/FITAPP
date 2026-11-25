import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type { LatLon } from '../lib/geo';
import { type OsmData, type PoiKind, type WayKind, loadOsm } from '../lib/osm';
import { type Bounds, cachedRaster, drawRelief } from '../lib/terrain';
import { useStore } from '../store';

export interface MapTrack {
  points: LatLon[];
  /** Ruta planificada (línea punteada) en vez de recorrido realizado. */
  planned?: boolean;
}

interface Props {
  tracks?: MapTrack[];
  /** Posición actual del usuario. */
  position?: LatLon | null;
  /** Puntos marcados (por ejemplo, los toques al trazar una ruta). */
  markers?: LatLon[];
  /** Mantiene el mapa centrado en la posición actual. */
  follow?: boolean;
  /** Al cambiar este valor, el mapa encuadra todos los recorridos. */
  fitKey?: string;
  center?: LatLon;
  onTap?: (p: LatLon) => void;
  /** Avisa la zona visible cada vez que el mapa se mueve. */
  onMove?: (b: Bounds, zoom: number) => void;
  height?: string;
}

const ATTR_OSM = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const LAYER_KEY = 'kaizen-map-layer';
type LayerId = 'relief' | 'streets' | 'topo' | 'sat';

/** Mapa en línea cuyas teselas ya vistas quedan guardadas y se reutilizan sin conexión. */
class CachedTileLayer extends L.TileLayer {
  constructor(
    url: string,
    private cacheId: string,
    options: L.TileLayerOptions,
  ) {
    super(url, options);
  }

  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const img = document.createElement('img');
    img.alt = '';
    const url = this.getTileUrl(coords);
    const finish = (src: string, revoke: boolean) => {
      img.onload = () => {
        if (revoke) URL.revokeObjectURL(src);
        done(undefined, img);
      };
      img.onerror = () => done(new Error('tesela no disponible'), img);
      img.src = src;
    };
    cachedRaster(this.cacheId, coords, url)
      .then((blob) => {
        if (!blob) throw new Error('sin tesela');
        finish(URL.createObjectURL(blob), true);
      })
      // Si el servidor no permite leer la imagen desde la app, se muestra directamente (sin guardarla).
      .catch(() => finish(url, false));
    return img;
  }
}

/** Mapa de relieve propio: sombreado y curvas de nivel dibujados en el teléfono. Funciona sin conexión. */
class ReliefLayer extends L.GridLayer {
  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    drawRelief(canvas, coords)
      .then(() => done(undefined, canvas))
      .catch((e: Error) => done(e, canvas));
    return canvas;
  }
}

const WAY_STYLE: Record<WayKind, { minZoom: number; style: L.PolylineOptions }> = {
  major: { minZoom: 9, style: { color: '#b0691f', weight: 3.2 } },
  road: { minZoom: 11, style: { color: '#cf9a45', weight: 2.4 } },
  minor: { minZoom: 14, style: { color: '#ffffff', weight: 1.8, opacity: 0.95 } },
  track: { minZoom: 12, style: { color: '#6f4f2a', weight: 1.9, dashArray: '8 5' } },
  path: { minZoom: 12, style: { color: '#c22a17', weight: 2.1, dashArray: '5 4' } },
  water: { minZoom: 12, style: { color: '#2b7cc0', weight: 1.4 } },
};

const POI_ZOOM: Record<PoiKind, number> = { place: 11, peak: 12, saddle: 14, hut: 13, camp: 13, viewpoint: 14, spring: 14 };
const POI_MARK: Record<PoiKind, string> = { peak: '▲', saddle: '◡', hut: '⌂', camp: '⛺', viewpoint: '◉', spring: '●', place: '' };

/** Etiqueta de un punto de interés. Se arma con nodos de texto: los nombres vienen de datos externos. */
function poiIcon(kind: PoiKind, name: string | undefined, ele: number | undefined): L.DivIcon {
  const el = document.createElement('div');
  el.className = `map-poi ${kind}`;
  if (POI_MARK[kind]) {
    const mark = document.createElement('i');
    mark.textContent = POI_MARK[kind];
    el.appendChild(mark);
  }
  const text = [name, ele !== undefined && kind !== 'place' ? `${ele} m` : ''].filter(Boolean).join(' · ');
  if (text) {
    const label = document.createElement('span');
    label.textContent = text;
    el.appendChild(label);
  }
  return L.divIcon({ html: el, className: '', iconSize: [0, 0] });
}

/** Mapa con relieve propio (sin conexión) y capas en línea de calles, topográfica y satelital. */
export default function MapView({ tracks = [], position, markers = [], follow, fitKey, center, onTap, onMove, height = '46vh' }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const overlay = useRef<L.LayerGroup | null>(null);
  const tapRef = useRef(onTap);
  const moveRef = useRef(onMove);
  tapRef.current = onTap;
  moveRef.current = onMove;

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true, maxZoom: 18 }).setView(center ?? [-33.45, -70.66], center ? 14 : 11);

    // Senderos y cumbres descargados, agrupados por el zoom desde el que se muestran.
    const renderer = L.canvas({ padding: 0.4 });
    const osm = L.layerGroup();
    const byZoom = new Map<number, L.LayerGroup>();
    const groupFor = (z: number) => {
      let g = byZoom.get(z);
      if (!g) {
        g = L.layerGroup();
        byZoom.set(z, g);
      }
      return g;
    };
    const applyZoom = () => {
      const z = m.getZoom();
      byZoom.forEach((g, min) => (z >= min ? osm.addLayer(g) : osm.removeLayer(g)));
    };
    const addData = (data: OsmData) => {
      for (const w of data.ways) {
        const cfg = WAY_STYLE[w.k];
        const pts: LatLon[] = [];
        for (let i = 0; i + 1 < w.p.length; i += 2) pts.push([w.p[i], w.p[i + 1]]);
        L.polyline(pts, { ...cfg.style, renderer, interactive: false }).addTo(groupFor(cfg.minZoom));
      }
      for (const p of data.pois) L.marker([p.lat, p.lon], { icon: poiIcon(p.k, p.n, p.ele), interactive: false, keyboard: false }).addTo(groupFor(POI_ZOOM[p.k]));
      applyZoom();
    };
    const loaded = new Set<string>();
    const loadRegions = () => {
      const b = m.getBounds();
      for (const r of useStore.getState().offlineRegions) {
        if (loaded.has(r.id) || r.bounds.n < b.getSouth() || r.bounds.s > b.getNorth() || r.bounds.e < b.getWest() || r.bounds.w > b.getEast()) continue;
        loaded.add(r.id);
        void loadOsm(r.id).then((data) => data && map.current === m && addData(data));
      }
    };

    const relief = L.layerGroup([new ReliefLayer({ maxZoom: 18, attribution: `Relieve: Terrain Tiles (Mapzen/AWS) · senderos ${ATTR_OSM}` }), osm]);
    const layers: Record<LayerId, L.Layer> = {
      relief,
      streets: new CachedTileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', 'streets', { maxZoom: 19, attribution: ATTR_OSM }),
      topo: new CachedTileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', 'topo', { maxZoom: 17, attribution: `${ATTR_OSM}, SRTM · © OpenTopoMap` }),
      sat: new CachedTileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', 'sat', { maxZoom: 18, attribution: 'Imágenes © Esri' }),
    };
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LAYER_KEY);
    } catch {
      /* sin almacenamiento */
    }
    // Sin conexión se abre directamente el mapa que no la necesita.
    const initial: LayerId = navigator.onLine === false ? 'relief' : saved && saved in layers ? (saved as LayerId) : 'streets';
    layers[initial].addTo(m);
    L.control.layers({ 'Relieve (sin conexión)': layers.relief, 'Calles y senderos': layers.streets, Topográfico: layers.topo, Satélite: layers.sat }, undefined, { position: 'topright' }).addTo(m);
    m.on('baselayerchange', (e) => {
      const id = (Object.keys(layers) as LayerId[]).find((k) => layers[k] === e.layer);
      try {
        if (id) localStorage.setItem(LAYER_KEY, id);
      } catch {
        /* sin almacenamiento */
      }
    });

    overlay.current = L.layerGroup().addTo(m);
    const report = () => {
      const b = m.getBounds();
      moveRef.current?.({ s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() }, m.getZoom());
    };
    m.on('click', (e) => tapRef.current?.([e.latlng.lat, e.latlng.lng]));
    m.on('zoomend', applyZoom);
    m.on('moveend', () => {
      loadRegions();
      report();
    });
    map.current = m;
    loadRegions();
    // El contenedor puede cambiar de tamaño al terminar la animación de entrada de la pantalla.
    const timer = setTimeout(() => {
      m.invalidateSize();
      report();
    }, 300);
    return () => {
      clearTimeout(timer);
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const group = overlay.current;
    if (!group) return;
    group.clearLayers();
    for (const t of tracks) {
      if (t.points.length === 0) continue;
      if (t.planned) {
        L.polyline(t.points, { color: '#ffffff', weight: 7, opacity: 0.85 }).addTo(group);
        L.polyline(t.points, { color: '#1c6bd9', weight: 4, dashArray: '2 9', lineCap: 'round' }).addTo(group);
      } else {
        L.polyline(t.points, { color: '#ffffff', weight: 7, opacity: 0.9 }).addTo(group);
        L.polyline(t.points, { color: '#e2572b', weight: 4 }).addTo(group);
      }
    }
    markers.forEach((p, i) => {
      const edge = i === 0 || i === markers.length - 1;
      L.circleMarker(p, { radius: edge ? 8 : 5, color: '#ffffff', weight: 2, fillColor: i === 0 ? '#1c9a57' : '#1c6bd9', fillOpacity: 1 }).addTo(group);
    });
    if (position) {
      L.circleMarker(position, { radius: 15, stroke: false, fillColor: '#1c6bd9', fillOpacity: 0.2 }).addTo(group);
      L.circleMarker(position, { radius: 7, color: '#ffffff', weight: 3, fillColor: '#1c6bd9', fillOpacity: 1 }).addTo(group);
    }
  }, [tracks, markers, position]);

  useEffect(() => {
    if (follow && position && map.current) map.current.setView(position, Math.max(map.current.getZoom(), 15), { animate: true });
  }, [follow, position]);

  useEffect(() => {
    const m = map.current;
    if (!m || fitKey === undefined) return;
    const all = tracks.flatMap((t) => t.points);
    if (all.length > 1) m.fitBounds(L.latLngBounds(all), { padding: [28, 28], maxZoom: 16 });
    else if (all.length === 1) m.setView(all[0], 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return <div ref={el} className="map" style={{ height }} role="application" aria-label="Mapa" />;
}
