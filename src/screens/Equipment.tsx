import { Camera, ImagePlus, Images, Lightbulb, PlayCircle, Sparkles, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Header, Spinner } from '../components/ui';
import { AiError, aiReady, analyzeEquipment, canGenerateImages, generateExerciseImage, prepareImage } from '../lib/ai';
import { MUSCLE_GROUPS, imagesUrl, videoUrl } from '../lib/exercises';
import type { EquipmentExercise, SavedEquipment } from '../lib/types';
import { uid } from '../lib/util';
import { push, useRoute } from '../router';
import { useStore } from '../store';

type ImageState = { status: 'loading' } | { status: 'done'; url: string } | { status: 'error'; msg: string };

function MuscleChips({ value, onChange, disabled }: { value: string; onChange: (m: string) => void; disabled?: boolean }) {
  return (
    <div className="chips" role="group" aria-label="Grupo muscular">
      {['', ...MUSCLE_GROUPS].map((m) => (
        <button key={m || 'any'} className={`chip ${value === m ? 'active' : ''}`} aria-pressed={value === m} disabled={disabled} onClick={() => onChange(m)}>
          {m || 'Cualquiera'}
        </button>
      ))}
    </div>
  );
}

export default function Equipment() {
  const { query } = useRoute();
  const ai = useStore((s) => s.ai);
  const setAi = useStore((s) => s.setAi);
  const saved = useStore((s) => s.equipment);
  const saveEquipment = useStore((s) => s.saveEquipment);
  const removeEquipment = useStore((s) => s.removeEquipment);
  const current = saved.find((e) => e.id === query.get('id')) ?? null;

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<{ base64: string; previewUrl: string; thumbUrl: string } | null>(null);
  const [text, setText] = useState('');
  const [muscle, setMuscle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  /** Fotos en memoria por equipo, para volver a consultar con otro grupo muscular. */
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [images, setImages] = useState<Record<string, ImageState>>({});

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      setImage(await prepareImage(file));
    } catch {
      setError('No se pudo abrir la imagen. Prueba con otra foto.');
    }
  };

  const run = async (target: string, existing?: SavedEquipment) => {
    setLoading(true);
    setError('');
    try {
      // Al cambiar de músculo en un equipo guardado se reutiliza su foto o, si ya no está en memoria, su nombre.
      const imageBase64 = existing ? photos[existing.id] : image?.base64;
      const description = existing ? (imageBase64 ? '' : existing.name) : text;
      const res = await analyzeEquipment(ai, { imageBase64, text: description, muscle: target }, (geminiModel) => setAi({ geminiModel }));
      if (res.exercises.length === 0) {
        setError(res.summary || 'No se reconoció un equipo de ejercicio. Prueba con otra foto o descríbelo.');
        return;
      }
      const id = existing?.id ?? uid();
      saveEquipment({
        id,
        name: existing && !imageBase64 ? existing.name : res.equipment,
        summary: res.summary,
        muscle: target,
        thumb: existing?.thumb ?? image?.thumbUrl,
        exercises: res.exercises,
        createdAt: Date.now(),
      });
      if (!existing) {
        if (image) setPhotos((p) => ({ ...p, [id]: image.base64 }));
        setImage(null);
        setText('');
        push(`/equipment?id=${id}`);
      }
    } catch (e) {
      setError(e instanceof AiError ? e.message : 'Ocurrió un error inesperado. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const makeImage = async (key: string, ex: EquipmentExercise, equipmentName: string) => {
    setImages((m) => ({ ...m, [key]: { status: 'loading' } }));
    try {
      const url = await generateExerciseImage(ai, ex, equipmentName, (geminiImageModel) => setAi({ geminiImageModel }));
      setImages((m) => ({ ...m, [key]: { status: 'done', url } }));
    } catch (e) {
      setImages((m) => ({ ...m, [key]: { status: 'error', msg: e instanceof AiError ? e.message : 'No se pudo generar la imagen.' } }));
    }
  };

  if (!aiReady(ai)) {
    return (
      <div className="screen">
        <Header title="Equipo y ejercicios" />
        <div className="card col center" style={{ alignItems: 'center', padding: 24 }}>
          <span className="badge" style={{ width: 56, height: 56 }}>
            <Sparkles size={28} />
          </span>
          <h2 className="card-title">Activa el análisis con IA</h2>
          <p className="small muted">
            Para reconocer una máquina o implemento desde una foto, la app usa un servicio de inteligencia artificial. Puedes usarlo gratis con una clave de Google Gemini:
            se configura una sola vez.
          </p>
          <button className="btn" onClick={() => push('/ai')}>
            Configurar ahora
          </button>
        </div>
      </div>
    );
  }

  if (current) {
    return (
      <div className="screen">
        <Header title="Equipo y ejercicios" />
        <div className="card row" style={{ alignItems: 'flex-start' }}>
          {current.thumb && <img src={current.thumb} alt="" style={{ width: 64, height: 64, borderRadius: 14, objectFit: 'cover', flexShrink: 0 }} />}
          <div className="grow">
            <h2 style={{ fontSize: 19, fontWeight: 800 }}>{current.name}</h2>
            {current.summary && <p className="small muted">{current.summary}</p>}
          </div>
        </div>

        <div className="field">
          <span>¿Qué quieres trabajar con este equipo?</span>
          <MuscleChips value={current.muscle} disabled={loading} onChange={(m) => m !== current.muscle && void run(m, current)} />
        </div>

        {loading && <Spinner label="Buscando ejercicios…" />}
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}

        {!loading &&
          current.exercises.map((ex, i) => {
            const key = `${current.id}:${current.muscle}:${i}`;
            const img = images[key];
            return (
              <div className="card col" key={key}>
                <div>
                  <h3 className="card-title" style={{ fontSize: 17 }}>
                    {i + 1}. {ex.name}
                  </h3>
                  <p className="small muted">{[ex.muscles, ex.setsReps].filter(Boolean).join(' · ')}</p>
                </div>
                {ex.steps.length > 0 && (
                  <ol className="small" style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {ex.steps.map((s, j) => (
                      <li key={j}>{s}</li>
                    ))}
                  </ol>
                )}
                {ex.tip && (
                  <div className="notice small row" style={{ alignItems: 'flex-start' }}>
                    <Lightbulb size={18} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>{ex.tip}</span>
                  </div>
                )}
                {img?.status === 'done' && <img className="photo-preview" style={{ maxHeight: 'none', objectFit: 'contain' }} src={img.url} alt={`Ilustración generada con IA de ${ex.name}`} />}
                {img?.status === 'loading' && <Spinner label="Generando imagen de referencia…" />}
                {img?.status === 'error' && (
                  <div className="notice small" role="status">
                    {img.msg}
                  </div>
                )}
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <a className="btn sm" href={videoUrl(ex.name)} target="_blank" rel="noreferrer">
                    <PlayCircle size={18} /> Ver video
                  </a>
                  <a className="btn sm secondary" href={imagesUrl(ex.name)} target="_blank" rel="noreferrer">
                    <Images size={18} /> Imágenes
                  </a>
                  {canGenerateImages(ai) && img?.status !== 'done' && (
                    <button className="btn sm secondary" disabled={img?.status === 'loading'} onClick={() => void makeImage(key, ex, current.name)}>
                      <Sparkles size={18} /> Generar imagen
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        <p className="xs muted">
          Sugerencias generadas por IA: revisa el video de referencia y empieza con poco peso. Las imágenes generadas son ilustrativas y pueden tener errores.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="screen with-footer">
        <Header title="Equipo y ejercicios" />
        <p className="small muted">Saca una foto a una máquina, mancuernas, banda o cualquier implemento y te digo qué ejercicios puedes hacer con él y cómo hacerlos.</p>

        {image ? (
          <div style={{ position: 'relative' }}>
            <img className="photo-preview" src={image.previewUrl} alt="Foto del equipo" />
            <button className="icon-btn filled" style={{ position: 'absolute', top: 10, right: 10 }} aria-label="Quitar foto" onClick={() => setImage(null)}>
              <X size={20} />
            </button>
          </div>
        ) : (
          <div className="quick-actions" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button className="quick-action" style={{ padding: '26px 8px' }} onClick={() => cameraRef.current?.click()}>
              <Camera size={30} />
              Tomar foto
            </button>
            <button className="quick-action" style={{ padding: '26px 8px' }} onClick={() => galleryRef.current?.click()}>
              <ImagePlus size={30} />
              Elegir de la galería
            </button>
          </div>
        )}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        <div className="field">
          <span>¿Qué grupo muscular quieres trabajar?</span>
          <MuscleChips value={muscle} onChange={setMuscle} disabled={loading} />
        </div>

        <label className="field">
          <span>{image ? 'Detalles (opcional)' : 'O describe el equipo que tienes'}</span>
          <div className="input-wrap">
            <textarea
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={image ? 'Ej: tiene asiento regulable y agarres arriba' : 'Ej: un par de mancuernas de 10 kg y una banda elástica'}
            />
          </div>
        </label>

        {loading && <Spinner label="Analizando el equipo…" />}
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}

        {saved.length > 0 && (
          <div className="card">
            <h2 className="card-title">Mis equipos</h2>
            <div className="list">
              {saved.map((e) => (
                <div className="list-item" style={{ padding: 0 }} key={e.id}>
                  <button className="row grow" style={{ textAlign: 'left', padding: '10px 0', minHeight: 56 }} onClick={() => push(`/equipment?id=${e.id}`)}>
                    {e.thumb ? (
                      <img src={e.thumb} alt="" style={{ width: 44, height: 44, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
                    ) : (
                      <span className="badge" style={{ width: 44, height: 44 }}>
                        <Sparkles size={20} />
                      </span>
                    )}
                    <div className="grow">
                      <div className="name">{e.name}</div>
                      <div className="sub">
                        {e.exercises.length} ejercicios · {e.muscle || 'General'}
                      </div>
                    </div>
                  </button>
                  <button className="icon-btn" aria-label={`Eliminar ${e.name}`} onClick={() => removeEquipment(e.id)}>
                    <Trash2 size={18} color="var(--text-3)" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="footer-bar">
        <button className="btn" disabled={loading || (!image && text.trim().length < 3)} onClick={() => void run(muscle)}>
          <Sparkles size={20} /> {loading ? 'Analizando…' : 'Ver ejercicios'}
        </button>
      </div>
    </>
  );
}
