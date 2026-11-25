import { Capacitor } from '@capacitor/core';
import { Flashlight, Globe, ImageUp, RefreshCw, ScanBarcode, ScanText, SwitchCamera } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Field, Header, Spinner } from '../components/ui';
import { AiError, canSearchWeb, findProductOnline } from '../lib/ai';
import { type CameraCaps, applyCamera, backCameras, cameraCaps, getDetector, googleScan, isValidBarcode } from '../lib/barcode';
import { defaultMeal, isMealId } from '../lib/meals';
import { lookupBarcode } from '../lib/off';
import type { MealId } from '../lib/types';
import { replace, useRoute } from '../router';
import { useStore, useUi } from '../store';

type State =
  | { kind: 'opening' }
  | { kind: 'cancelled' }
  | { kind: 'starting' }
  | { kind: 'scanning' }
  | { kind: 'no-camera'; reason: string }
  | { kind: 'looking'; code: string }
  | { kind: 'not-found'; code: string; name?: string }
  | { kind: 'error'; code: string };

const CAMERA_KEY = 'kaizen-scan-camera';
const ZOOMS = [1, 2, 3];

function savedCamera(): string | undefined {
  try {
    return localStorage.getItem(CAMERA_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export default function Scanner() {
  const { query } = useRoute();
  const mealParam = query.get('meal');
  const meal: MealId = isMealId(mealParam) ? mealParam : defaultMeal();
  const setDraft = useUi((s) => s.setDraft);
  const showToast = useUi((s) => s.showToast);
  const setPrefill = useUi((s) => s.setPrefill);
  const customFoods = useStore((s) => s.customFoods);
  const ai = useStore((s) => s.ai);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // En Android se abre primero el escáner de Google; la cámara dentro de la app queda como alternativa.
  const [inApp, setInApp] = useState(!Capacitor.isNativePlatform());
  const [state, setState] = useState<State>({ kind: inApp ? 'starting' : 'opening' });
  const [manual, setManual] = useState('');
  const [session, setSession] = useState(0);
  const [web, setWeb] = useState<{ status: 'idle' | 'loading' | 'none' | 'error'; msg?: string }>({ status: 'idle' });
  const [cameraId, setCameraId] = useState<string | undefined>(savedCamera);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [caps, setCaps] = useState<CameraCaps>({});
  const [zoom, setZoom] = useState(2);
  const [torch, setTorch] = useState(false);
  const busy = useRef(false);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const autoPicked = useRef(false);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const stopCamera = () => {
    trackRef.current?.stop();
    trackRef.current = null;
  };

  const handleCode = useCallback(
    async (code: string) => {
      if (busy.current) return;
      busy.current = true;
      navigator.vibrate?.(40);
      setState({ kind: 'looking', code });
      const own = customFoods.find((f) => f.barcode === code);
      if (own) {
        setDraft({ food: own, grams: own.portion?.grams ?? 100, meal });
        replace('/food');
        return;
      }
      try {
        const res = await lookupBarcode(code);
        if (res.status === 'found') {
          setDraft({ food: res.food, grams: res.food.portion?.grams ?? 100, meal });
          replace('/food');
          return;
        }
        setWeb({ status: 'idle' });
        setState({ kind: 'not-found', code, name: res.status === 'incomplete' ? res.name : undefined });
      } catch {
        setState({ kind: 'error', code });
      }
      // La cámara se apaga hasta que el usuario decida escanear de nuevo.
      stopCamera();
    },
    [customFoods, meal, setDraft],
  );
  const handleRef = useRef(handleCode);
  handleRef.current = handleCode;

  // Escáner de Google (Android).
  useEffect(() => {
    if (inApp) return;
    let alive = true;
    busy.current = false;
    setState({ kind: 'opening' });
    void googleScan().then((res) => {
      if (!alive) return;
      if (res.status === 'code') void handleRef.current(res.code);
      else if (res.status === 'cancelled') setState({ kind: 'cancelled' });
      else setInApp(true);
    });
    return () => {
      alive = false;
    };
  }, [inApp, session]);

  // Cámara dentro de la app.
  useEffect(() => {
    if (!inApp) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    busy.current = false;
    setTorch(false);
    setState({ kind: 'starting' });

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState({ kind: 'no-camera', reason: 'Este dispositivo no permite usar la cámara desde la app.' });
        return;
      }
      const open = (id?: string) =>
        navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { ...(id ? { deviceId: { exact: id } } : { facingMode: { ideal: 'environment' } }), width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
      let opened: MediaStream;
      try {
        // Si la cámara guardada ya no existe se vuelve a la trasera por defecto.
        opened = await open(cameraId).catch((e) => (cameraId ? open() : Promise.reject(e)));
      } catch (e) {
        const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
        setState({
          kind: 'no-camera',
          reason: denied ? 'No hay permiso para usar la cámara. Actívalo en los ajustes de la app.' : 'No se encontró una cámara disponible.',
        });
        return;
      }
      stream = opened;
      if (stopped) {
        opened.getTracks().forEach((t) => t.stop());
        return;
      }
      const track = opened.getVideoTracks()[0];
      trackRef.current = track;

      // En teléfonos con varios lentes se elige la cámara principal, que es la que enfoca de cerca.
      const list = await backCameras();
      if (stopped) return;
      setCameras(list);
      if (!cameraId && !autoPicked.current && list.length > 1 && list[0].label && track.label !== list[0].label) {
        autoPicked.current = true;
        setCameraId(list[0].deviceId);
        return;
      }

      const c = cameraCaps(track);
      setCaps(c);
      if (c.focusMode?.includes('continuous')) await applyCamera(track, { focusMode: 'continuous' });
      // Con algo de zoom el teléfono se sostiene más lejos, donde la cámara sí logra enfocar.
      if (c.zoom) await applyCamera(track, { zoom: Math.min(c.zoom.max, Math.max(c.zoom.min, zoomRef.current)) });

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = opened;
      await video.play().catch(() => undefined);
      const detector = await getDetector();
      if (stopped) return;
      setState({ kind: 'scanning' });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      let frame = 0;
      const tick = async () => {
        if (stopped) return;
        if (!busy.current && video.readyState >= 2 && video.videoWidth > 0 && ctx) {
          try {
            // Se lee sobre todo la franja central (donde está el marco): es más rápido y preciso.
            const full = ++frame % 4 === 0;
            const vw = video.videoWidth;
            const vh = video.videoHeight;
            const cw = full ? vw : Math.round(vw * 0.84);
            const ch = full ? vh : Math.round(vh * 0.46);
            const scale = Math.min(1, 1400 / cw);
            canvas.width = Math.round(cw * scale);
            canvas.height = Math.round(ch * scale);
            ctx.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, canvas.width, canvas.height);
            const found = await detector.detect(canvas);
            const hit = found.map((f) => f.rawValue).find(isValidBarcode);
            if (hit && !stopped) void handleRef.current(hit);
          } catch {
            /* cuadro no legible: se reintenta */
          }
        }
        timer = setTimeout(tick, 140);
      };
      void tick();
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [inApp, session, cameraId]);

  const scanFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const detector = await getDetector();
      const found = await detector.detect(bitmap);
      bitmap.close();
      const hit = found.map((f) => f.rawValue).find(isValidBarcode);
      if (hit) void handleCode(hit);
      else showToast('No se detectó ningún código de barras en la foto');
    } catch {
      showToast('No se pudo leer la imagen');
    }
  };

  const toForm = (code: string, name?: string) => replace(`/custom-food?meal=${meal}&barcode=${code}${name ? `&name=${encodeURIComponent(name)}` : ''}`);

  const searchWeb = async (code: string, name?: string) => {
    setWeb({ status: 'loading' });
    try {
      const found = await findProductOnline(ai, code, name);
      if (!found) return setWeb({ status: 'none' });
      // Los datos van al formulario para compararlos con el envase antes de guardar.
      setPrefill(found);
      toForm(code, found.food.name);
    } catch (e) {
      setWeb({ status: 'error', msg: e instanceof AiError ? e.message : 'No se pudo buscar en internet.' });
    }
  };

  const changeZoom = (z: number) => {
    setZoom(z);
    if (trackRef.current && caps.zoom) void applyCamera(trackRef.current, { zoom: Math.min(caps.zoom.max, Math.max(caps.zoom.min, z)) });
  };

  const toggleTorch = () => {
    if (!trackRef.current) return;
    void applyCamera(trackRef.current, { torch: !torch });
    setTorch(!torch);
  };

  const nextCamera = () => {
    if (cameras.length < 2) return;
    const current = cameras.findIndex((c) => c.label === trackRef.current?.label);
    const next = cameras[(current + 1) % cameras.length];
    try {
      localStorage.setItem(CAMERA_KEY, next.deviceId);
    } catch {
      /* sin almacenamiento */
    }
    autoPicked.current = true;
    setCameraId(next.deviceId);
  };

  const refocus = () => {
    const track = trackRef.current;
    if (!track || !caps.focusMode?.includes('continuous')) return;
    // Volver a pedir el enfoque continuo obliga a la cámara a enfocar otra vez.
    const first = caps.focusMode.includes('single-shot') ? 'single-shot' : 'continuous';
    void applyCamera(track, { focusMode: first }).then(() => setTimeout(() => void applyCamera(track, { focusMode: 'continuous' }), 900));
  };

  // Con Claude configurado, la búsqueda en internet parte sola cuando la base abierta no trae los datos.
  const autoSearched = useRef('');
  useEffect(() => {
    if (state.kind !== 'not-found' || web.status !== 'idle' || !canSearchWeb(ai) || autoSearched.current === state.code) return;
    autoSearched.current = state.code;
    void searchWeb(state.code, state.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, web.status]);

  const manualCode = manual.replace(/\D/g, '');
  const showVideo = inApp && (state.kind === 'starting' || state.kind === 'scanning' || state.kind === 'looking');
  const restart = () => setSession((s) => s + 1);
  const zoomOptions = caps.zoom ? ZOOMS.filter((z) => z >= caps.zoom!.min && z <= caps.zoom!.max) : [];

  return (
    <div className="screen">
      <Header title="Escanear producto" />

      {state.kind === 'opening' && <Spinner label="Abriendo el escáner…" />}

      {state.kind === 'cancelled' && (
        <div className="card col">
          <h2 className="card-title">Escanea el código de barras</h2>
          <p className="small muted">El escáner enfoca y acerca la imagen solo. Sostén el teléfono a unos 15 cm del código, con buena luz.</p>
          <button className="btn" onClick={restart}>
            <ScanBarcode size={18} /> Abrir el escáner
          </button>
          <button className="btn secondary" onClick={() => setInApp(true)}>
            Usar la cámara dentro de la app
          </button>
        </div>
      )}

      {showVideo && (
        <>
          <div className="scanner" onClick={refocus}>
            <video ref={videoRef} playsInline muted aria-label="Vista de la cámara" />
            <div className="frame" />
            <div className="hint">{state.kind === 'looking' ? `Buscando ${state.code}…` : state.kind === 'starting' ? 'Abriendo cámara…' : 'Apunta al código de barras'}</div>
          </div>
          {state.kind === 'scanning' && (
            <>
              {(zoomOptions.length > 1 || caps.torch || cameras.length > 1) && (
                <div className="chips" role="group" aria-label="Controles de la cámara">
                  {zoomOptions.length > 1 &&
                    zoomOptions.map((z) => (
                      <button key={z} className={`chip ${zoom === z ? 'active' : ''}`} aria-pressed={zoom === z} onClick={() => changeZoom(z)}>
                        {z}×
                      </button>
                    ))}
                  {caps.torch && (
                    <button className={`chip ${torch ? 'active' : ''}`} aria-pressed={torch} onClick={toggleTorch}>
                      <Flashlight size={16} /> Linterna
                    </button>
                  )}
                  {cameras.length > 1 && (
                    <button className="chip" onClick={nextCamera}>
                      <SwitchCamera size={16} /> Cambiar cámara
                    </button>
                  )}
                </div>
              )}
              <p className="xs muted">
                Si se ve borroso, aleja el teléfono unos 15 cm y toca la imagen para volver a enfocar.{cameras.length > 1 ? ' Si sigue sin enfocar, prueba con «Cambiar cámara».' : ''}
              </p>
            </>
          )}
        </>
      )}

      {state.kind === 'looking' && <Spinner label="Consultando Open Food Facts…" />}

      {state.kind === 'no-camera' && (
        <div className="notice" role="alert">
          {state.reason}
        </div>
      )}

      {state.kind === 'not-found' && (
        <div className="card col">
          <h2 className="card-title">{state.name ? 'Producto sin datos nutricionales' : 'Producto no encontrado'}</h2>
          <p className="small muted">
            {state.name ? `«${state.name}» está en Open Food Facts, pero sin calorías registradas.` : `El código ${state.code} no está en Open Food Facts, la base abierta de productos.`} Hay dos
            formas de agregarlo; en ambas queda guardado con su código y la próxima vez se reconoce al escanearlo.
          </p>
          {web.status === 'loading' ? (
            <Spinner label="Buscando el producto en internet… puede tardar hasta un minuto." />
          ) : (
            <>
              {web.status === 'none' && (
                <div className="notice small" role="status">
                  No se encontró en internet una tabla nutricional confiable para este producto. Usa la foto de la etiqueta.
                </div>
              )}
              {web.status === 'error' && (
                <div className="notice error small" role="alert">
                  {web.msg}
                </div>
              )}
              {canSearchWeb(ai) && web.status !== 'none' && (
                <button className="btn" onClick={() => void searchWeb(state.code, state.name)}>
                  <Globe size={18} /> Buscar en internet con IA
                </button>
              )}
              <button className={`btn ${canSearchWeb(ai) && web.status !== 'none' ? 'secondary' : ''}`} onClick={() => toForm(state.code, state.name)}>
                <ScanText size={18} /> Agregar con foto de la etiqueta
              </button>
              {!canSearchWeb(ai) && <p className="xs muted">Con Claude configurado en Perfil → Inteligencia artificial, la app también puede buscar el producto en internet.</p>}
              <button className="btn ghost" onClick={restart}>
                <RefreshCw size={18} /> Escanear otro
              </button>
            </>
          )}
        </div>
      )}

      {state.kind === 'error' && (
        <div className="card col">
          <h2 className="card-title">Sin conexión con la base de productos</h2>
          <p className="small muted">No se pudo consultar el código {state.code}. Revisa tu conexión a internet.</p>
          <button
            className="btn"
            onClick={() => {
              busy.current = false;
              void handleCode(state.code);
            }}
          >
            Reintentar
          </button>
          <button className="btn secondary" onClick={restart}>
            <RefreshCw size={18} /> Escanear otro
          </button>
        </div>
      )}

      {(state.kind === 'scanning' || state.kind === 'starting' || state.kind === 'no-camera' || state.kind === 'cancelled') && (
        <div className="card col">
          <Field label="¿No lee el código? Escríbelo" value={manual} onChange={setManual} numeric placeholder="Ej: 7802800716777" />
          <button className="btn secondary" disabled={manualCode.length < 8} onClick={() => void handleCode(manualCode)}>
            Buscar código
          </button>
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>
            <ImageUp size={18} /> Leer desde una foto
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void scanFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      )}
    </div>
  );
}
