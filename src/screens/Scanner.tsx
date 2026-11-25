import { ImageUp, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Field, Header, Spinner } from '../components/ui';
import { getDetector, isValidBarcode } from '../lib/barcode';
import { defaultMeal, isMealId } from '../lib/meals';
import { lookupBarcode } from '../lib/off';
import type { MealId } from '../lib/types';
import { replace, useRoute } from '../router';
import { useStore, useUi } from '../store';

type State =
  | { kind: 'starting' }
  | { kind: 'scanning' }
  | { kind: 'no-camera'; reason: string }
  | { kind: 'looking'; code: string }
  | { kind: 'not-found'; code: string; name?: string }
  | { kind: 'error'; code: string };

export default function Scanner() {
  const { query } = useRoute();
  const mealParam = query.get('meal');
  const meal: MealId = isMealId(mealParam) ? mealParam : defaultMeal();
  const setDraft = useUi((s) => s.setDraft);
  const showToast = useUi((s) => s.showToast);
  const customFoods = useStore((s) => s.customFoods);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ kind: 'starting' });
  const [manual, setManual] = useState('');
  const [session, setSession] = useState(0);
  const busy = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
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
        setState({ kind: 'not-found', code, name: res.status === 'incomplete' ? res.name : undefined });
      } catch {
        setState({ kind: 'error', code });
      }
      // La cámara se apaga hasta que el usuario decida escanear de nuevo.
      stopCamera();
    },
    [customFoods, meal, setDraft],
  );

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    busy.current = false;
    setState({ kind: 'starting' });

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState({ kind: 'no-camera', reason: 'Este dispositivo no permite usar la cámara desde la app.' });
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (e) {
        const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
        setState({
          kind: 'no-camera',
          reason: denied ? 'No hay permiso para usar la cámara. Actívalo en los ajustes de la app.' : 'No se encontró una cámara disponible.',
        });
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      const detector = await getDetector();
      if (stopped) return;
      setState({ kind: 'scanning' });

      const tick = async () => {
        if (stopped) return;
        if (!busy.current && video.readyState >= 2) {
          try {
            const found = await detector.detect(video);
            const hit = found.map((f) => f.rawValue).find(isValidBarcode);
            if (hit && !stopped) void handleCode(hit);
          } catch {
            /* cuadro no legible: se reintenta */
          }
        }
        timer = setTimeout(tick, 180);
      };
      void tick();
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [handleCode, session]);

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

  const manualCode = manual.replace(/\D/g, '');
  const showVideo = state.kind === 'starting' || state.kind === 'scanning' || state.kind === 'looking';
  const restart = () => setSession((s) => s + 1);

  return (
    <div className="screen">
      <Header title="Escanear producto" />

      {showVideo && (
        <div className="scanner">
          <video ref={videoRef} playsInline muted aria-label="Vista de la cámara" />
          <div className="frame" />
          <div className="hint">{state.kind === 'looking' ? `Buscando ${state.code}…` : state.kind === 'starting' ? 'Abriendo cámara…' : 'Apunta al código de barras'}</div>
        </div>
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
            {state.name ? `«${state.name}» está en Open Food Facts, pero sin calorías registradas.` : `El código ${state.code} no está en Open Food Facts.`} Agrégalo sacando
            una foto a su tabla nutricional: se completan los valores exactos y la próxima vez se reconocerá al escanearlo.
          </p>
          <button className="btn" onClick={() => replace(`/custom-food?meal=${meal}&barcode=${state.code}${state.name ? `&name=${encodeURIComponent(state.name)}` : ''}`)}>
            Agregar con foto de la etiqueta
          </button>
          <button className="btn secondary" onClick={restart}>
            <RefreshCw size={18} /> Escanear otro
          </button>
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

      {(state.kind === 'scanning' || state.kind === 'starting' || state.kind === 'no-camera') && (
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
