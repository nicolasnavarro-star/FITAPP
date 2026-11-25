import { Download, MapPinned, Trash2, WifiOff } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import MapView from '../components/MapView';
import { Field, Header } from '../components/ui';
import { haversine } from '../lib/geo';
import { currentLocation } from '../lib/location';
import { deleteOsm, fetchOsm, saveOsm } from '../lib/osm';
import { type Bounds, type TileId, clearRasterCache, deleteTerrain, downloadTerrain, tileStoreUsage, tilesForBounds } from '../lib/terrain';
import { fmt, formatDate, toDateKey, uid } from '../lib/util';
import { useRoute } from '../router';
import { useStore, useUi } from '../store';

const MAX_TILES = 420;
const AVG_TILE_KB = 85;
const tileKey = (t: TileId) => `${t.z}/${t.x}/${t.y}`;
const mb = (bytes: number) => (bytes / 1048576).toLocaleString('es-CL', { maximumFractionDigits: bytes < 10485760 ? 1 : 0 });

export default function OfflineMaps() {
  const { query } = useRoute();
  const routeId = query.get('route');
  const route = useStore((s) => s.routes.find((r) => r.id === routeId));
  const regions = useStore((s) => s.offlineRegions);
  const addRegion = useStore((s) => s.addRegion);
  const removeRegion = useStore((s) => s.removeRegion);
  const lastLoc = useStore((s) => s.lastLoc);
  const setLastLoc = useStore((s) => s.setLastLoc);
  const showToast = useUi((s) => s.showToast);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [name, setName] = useState(route?.name ?? '');
  const [progress, setProgress] = useState<{ done: number; total: number; stage: 'relief' | 'trails' } | null>(null);
  const [usage, setUsage] = useState<{ tiles: number; bytes: number | null } | null>(null);
  const [me, setMe] = useState<[number, number] | null>(null);
  const abort = useRef<AbortController | null>(null);

  const refreshUsage = () => void tileStoreUsage().then(setUsage);
  useEffect(() => {
    refreshUsage();
    return () => abort.current?.abort();
  }, []);

  const tracks = useMemo(() => (route ? [{ points: route.preview, planned: true }] : []), [route]);
  const tiles = useMemo(() => (bounds ? tilesForBounds(bounds) : []), [bounds]);
  const widthKm = bounds ? haversine(bounds.s, bounds.w, bounds.s, bounds.e) / 1000 : 0;
  const heightKm = bounds ? haversine(bounds.s, bounds.w, bounds.n, bounds.w) / 1000 : 0;
  const tooBig = tiles.length > MAX_TILES;

  const download = async () => {
    if (!bounds || tooBig || progress) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setProgress({ done: 0, total: tiles.length, stage: 'relief' });
    try {
      const res = await downloadTerrain(tiles, (done, total) => setProgress({ done, total, stage: 'relief' }), ctrl.signal);
      if (res.saved === 0) throw new Error('sin conexión');
      setProgress({ done: tiles.length, total: tiles.length, stage: 'trails' });
      const id = uid();
      let ways = 0;
      try {
        const osm = await fetchOsm(bounds, ctrl.signal);
        await saveOsm(id, osm);
        ways = osm.ways.length;
      } catch {
        if (ctrl.signal.aborted) throw new Error('cancelado');
        showToast('El relieve quedó guardado, pero no se pudieron bajar los senderos. Intenta de nuevo más tarde.');
      }
      addRegion({ id, name: name.trim() || `Zona del ${formatDate(toDateKey(new Date()))}`, bounds, createdAt: Date.now(), tiles: res.saved, bytes: res.bytes, ways });
      if (ways > 0) showToast(res.saved < tiles.length ? 'Zona guardada, con algunas partes del relieve incompletas' : 'Zona guardada: ya puedes usarla sin conexión');
      setName('');
    } catch (e) {
      if (!ctrl.signal.aborted) showToast(e instanceof Error && e.message === 'sin conexión' ? 'No se pudo descargar: revisa tu conexión' : 'No se pudo descargar la zona');
    } finally {
      setProgress(null);
      abort.current = null;
      refreshUsage();
    }
  };

  const remove = async (id: string) => {
    const target = regions.find((r) => r.id === id);
    if (!target) return;
    // El relieve se comparte entre zonas: solo se borra lo que ninguna otra necesita.
    const keep = new Set(regions.filter((r) => r.id !== id).flatMap((r) => tilesForBounds(r.bounds).map(tileKey)));
    removeRegion(id);
    await deleteOsm(id);
    await deleteTerrain(tilesForBounds(target.bounds).filter((t) => !keep.has(tileKey(t))));
    showToast('Zona eliminada');
    refreshUsage();
  };

  const locate = async () => {
    try {
      const fix = await currentLocation();
      setMe([fix.lat, fix.lon]);
      setLastLoc(fix.lat, fix.lon);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo obtener tu ubicación');
    }
  };

  return (
    <div className="screen">
      <Header
        title="Mapas sin conexión"
        right={
          <button className="icon-btn" aria-label="Centrar en mi ubicación" onClick={() => void locate()}>
            <MapPinned size={20} />
          </button>
        }
      />
      <p className="small muted">
        Encuadra en el mapa la zona donde vas a salir y descárgala. Queda guardado el relieve con curvas de nivel, los senderos, caminos y cumbres, y las altitudes para medir el
        desnivel sin señal.
      </p>
      <MapView
        tracks={tracks}
        fitKey={route ? `route-${route.id}` : undefined}
        position={me}
        follow={me !== null}
        center={lastLoc ? [lastLoc.lat, lastLoc.lon] : undefined}
        onMove={(b) => setBounds(b)}
        height="42vh"
      />

      <div className="card col">
        <div className="row spread">
          <h2 className="card-title">Zona en pantalla</h2>
          <span className="small muted num">{bounds ? `${fmt(widthKm, 1)} × ${fmt(heightKm, 1)} km` : '…'}</span>
        </div>
        {progress ? (
          <>
            <div className="progress-track" role="progressbar" aria-label="Descarga" aria-valuenow={progress.done} aria-valuemax={progress.total}>
              <div style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
            <p className="small muted num" role="status">
              {progress.stage === 'relief' ? `Descargando relieve: ${progress.done} de ${progress.total}` : 'Descargando senderos y cumbres…'}
            </p>
            <button className="btn secondary" onClick={() => abort.current?.abort()}>
              Cancelar
            </button>
          </>
        ) : (
          <>
            {tooBig ? (
              <div className="notice small" role="status">
                La zona es demasiado grande para descargarla de una vez. Acerca el mapa hasta dejar solo el sector de tu salida.
              </div>
            ) : (
              <p className="small muted num">Ocupará cerca de {fmt((tiles.length * AVG_TILE_KB) / 1024, tiles.length * AVG_TILE_KB < 10240 ? 1 : 0)} MB.</p>
            )}
            <Field label="Nombre de la zona" value={name} onChange={setName} placeholder="Ej: Manquehue y Carbón" />
            <button className="btn" disabled={!bounds || tooBig} onClick={() => void download()}>
              <Download size={18} /> Descargar esta zona
            </button>
          </>
        )}
      </div>

      <h2 className="section-title">Zonas descargadas</h2>
      <div className="card" style={{ paddingTop: 6, paddingBottom: 6 }}>
        {regions.length > 0 ? (
          <div className="list">
            {regions.map((r) => (
              <div className="list-item" key={r.id}>
                <span className="badge">
                  <WifiOff size={18} />
                </span>
                <div className="grow">
                  <div className="name">{r.name}</div>
                  <div className="sub num">
                    {formatDate(toDateKey(new Date(r.createdAt)), true)} · {mb(r.bytes)} MB · {r.ways > 0 ? `${fmt(r.ways)} senderos y caminos` : 'solo relieve'}
                  </div>
                </div>
                <button className="icon-btn" aria-label={`Eliminar ${r.name}`} disabled={progress !== null} onClick={() => void remove(r.id)}>
                  <Trash2 size={18} color="var(--text-3)" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty">Todavía no has descargado ninguna zona.</p>
        )}
      </div>

      <p className="xs muted num">
        En el mapa, elige la capa «Relieve (sin conexión)» para ver lo descargado; sin señal se abre sola. Las capas en línea (calles, topográfica y satélite) también guardan lo que
        ya viste.{usage ? ` Mapas guardados en el teléfono: ${fmt(usage.tiles)} teselas.` : ''}
      </p>
      <button
        className="btn ghost"
        onClick={() =>
          void clearRasterCache().then(() => {
            showToast('Se borraron los mapas en línea guardados');
            refreshUsage();
          })
        }
      >
        Borrar mapas en línea guardados
      </button>
    </div>
  );
}
