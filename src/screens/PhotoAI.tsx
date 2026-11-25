import { Camera, ImagePlus, Sparkles, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Header, Spinner } from '../components/ui';
import { type AiItem, AiError, aiItemToFood, aiReady, analyzeMeal, prepareImage } from '../lib/ai';
import { MEALS, defaultMeal, isMealId, mealLabel } from '../lib/meals';
import type { MealId } from '../lib/types';
import { fmt, parseNum } from '../lib/util';
import { backToRoot, push, useRoute } from '../router';
import { useStore, useUi } from '../store';

interface Row {
  /** Estimación original de la IA; al cambiar los gramos se escala desde aquí. */
  base: AiItem;
  grams: string;
}

function scaled(row: Row): AiItem {
  const g = parseNum(row.grams);
  const f = g !== null && g > 0 ? g / row.base.grams : 0;
  return { ...row.base, grams: g ?? 0, kcal: row.base.kcal * f, protein: row.base.protein * f, carbs: row.base.carbs * f, fat: row.base.fat * f };
}

export default function PhotoAI() {
  const { query } = useRoute();
  const mealParam = query.get('meal');
  const [meal, setMeal] = useState<MealId>(isMealId(mealParam) ? mealParam : defaultMeal());
  const date = useUi((s) => s.date);
  const showToast = useUi((s) => s.showToast);
  const ai = useStore((s) => s.ai);
  const setAi = useStore((s) => s.setAi);
  const addEntry = useStore((s) => s.addEntry);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<{ base64: string; previewUrl: string } | null>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [notes, setNotes] = useState('');

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setRows(null);
    try {
      setImage(await prepareImage(file));
    } catch {
      setError('No se pudo abrir la imagen. Prueba con otra foto.');
    }
  };

  const analyze = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await analyzeMeal(ai, { imageBase64: image?.base64, text }, (geminiModel) => setAi({ geminiModel }));
      if (res.items.length === 0) {
        setError(res.notes || 'No se reconoció comida. Prueba con otra foto o agrega una descripción.');
        setRows(null);
      } else {
        setRows(res.items.map((base) => ({ base, grams: String(base.grams) })));
        setNotes(res.notes);
      }
    } catch (e) {
      setError(e instanceof AiError ? e.message : 'Ocurrió un error inesperado. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const items = rows?.map(scaled) ?? [];
  const valid = items.filter((i) => i.grams > 0);
  const total = valid.reduce((a, i) => ({ kcal: a.kcal + i.kcal, protein: a.protein + i.protein, carbs: a.carbs + i.carbs, fat: a.fat + i.fat }), {
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  });

  const addAll = () => {
    if (!rows) return;
    for (const row of rows) {
      const it = scaled(row);
      if (it.grams > 0) addEntry({ date, meal, food: aiItemToFood(row.base), grams: it.grams });
    }
    showToast(`${valid.length} ${valid.length === 1 ? 'alimento agregado' : 'alimentos agregados'} a ${mealLabel(meal)}`);
    backToRoot();
  };

  if (!aiReady(ai)) {
    return (
      <div className="screen">
        <Header title="Foto con IA" />
        <div className="card col center" style={{ alignItems: 'center', padding: 24 }}>
          <span className="badge" style={{ width: 56, height: 56 }}>
            <Sparkles size={28} />
          </span>
          <h2 className="card-title">Activa el análisis con IA</h2>
          <p className="small muted">
            Para reconocer tu comida desde una foto, la app usa un servicio de inteligencia artificial. Puedes usarlo gratis con una clave de Google Gemini: se configura
            una sola vez y toma un par de minutos.
          </p>
          <button className="btn" onClick={() => push('/ai')}>
            Configurar ahora
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="screen with-footer">
        <Header title="Foto con IA" />

        {image ? (
          <div style={{ position: 'relative' }}>
            <img className="photo-preview" src={image.previewUrl} alt="Foto de la comida" />
            <button
              className="icon-btn filled"
              style={{ position: 'absolute', top: 10, right: 10 }}
              aria-label="Quitar foto"
              onClick={() => {
                setImage(null);
                setRows(null);
              }}
            >
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

        {!rows && (
          <label className="field">
            <span>{image ? 'Detalles (opcional)' : 'O describe lo que comiste'}</span>
            <div className="input-wrap">
              <textarea
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={image ? 'Ej: el arroz es integral, cocinado con 1 cucharada de aceite' : 'Ej: 2 huevos revueltos con una marraqueta y palta'}
              />
            </div>
          </label>
        )}

        {loading && <Spinner label="Analizando tu comida…" />}
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}

        {rows && (
          <>
            <div className="card">
              <div className="row spread">
                <h2 className="card-title">Alimentos detectados</h2>
                <span className="kcal num" style={{ fontWeight: 800 }}>
                  {fmt(total.kcal)} kcal
                </span>
              </div>
              <p className="xs muted num">
                P {fmt(total.protein)} g · C {fmt(total.carbs)} g · G {fmt(total.fat)} g
              </p>
              <div className="list" style={{ marginTop: 6 }}>
                {rows.map((row, i) => {
                  const it = items[i];
                  return (
                    <div className="list-item" key={i}>
                      <div className="grow">
                        <div className="name">{row.base.name}</div>
                        <div className="sub num">
                          {fmt(it.kcal)} kcal · P {fmt(it.protein)} · C {fmt(it.carbs)} · G {fmt(it.fat)}
                        </div>
                      </div>
                      <div className="input-wrap" style={{ width: 96, minHeight: 44, padding: '0 10px' }}>
                        <input
                          inputMode="decimal"
                          value={row.grams}
                          aria-label={`Gramos de ${row.base.name}`}
                          style={{ padding: '8px 0', textAlign: 'right' }}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, grams: e.target.value } : r)))}
                        />
                        <span className="suffix">g</span>
                      </div>
                      <button className="icon-btn" aria-label={`Quitar ${row.base.name}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                        <Trash2 size={18} color="var(--text-3)" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            {notes && <p className="xs muted">{notes}</p>}
            <p className="xs muted">Es una estimación: ajusta los gramos si conoces la cantidad real.</p>
            <div className="field">
              <span>Comida</span>
              <div className="chips">
                {MEALS.map((mm) => (
                  <button key={mm.id} className={`chip ${meal === mm.id ? 'active' : ''}`} onClick={() => setMeal(mm.id)}>
                    {mm.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      <div className="footer-bar">
        {rows ? (
          <button className="btn" disabled={valid.length === 0} onClick={addAll}>
            Agregar a {mealLabel(meal)}
          </button>
        ) : (
          <button className="btn" disabled={loading || (!image && text.trim().length < 3)} onClick={() => void analyze()}>
            <Sparkles size={20} /> {loading ? 'Analizando…' : 'Analizar con IA'}
          </button>
        )}
      </div>
    </>
  );
}
