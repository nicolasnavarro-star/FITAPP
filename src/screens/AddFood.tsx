import { Camera, PencilLine, ScanBarcode, Search, Sparkles, Trash2, X, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Field, FoodThumb, Header, Segmented, Sheet, Spinner } from '../components/ui';
import { AiError, aiReady, lookupFoods } from '../lib/ai';
import { searchFoods } from '../lib/foods';
import { defaultMeal, isMealId, mealLabel } from '../lib/meals';
import { searchOnline } from '../lib/off';
import type { Food, MealId } from '../lib/types';
import { fmt, parseNum, uid } from '../lib/util';
import { backToRoot, push, useRoute } from '../router';
import { useStore, useUi } from '../store';

function FoodRow({ food, grams, tag, onClick, onDelete }: { food: Food; grams?: number; tag?: string; onClick: () => void; onDelete?: () => void }) {
  const amount = grams ?? food.portion?.grams ?? 100;
  return (
    <div className="list-item" style={{ padding: 0 }}>
      <button className="row grow" style={{ textAlign: 'left', padding: '10px 0', minHeight: 60 }} onClick={onClick}>
        <FoodThumb name={food.name} image={food.image} />
        <div className="grow">
          <div className="name">{food.name}</div>
          <div className="sub num">
            {food.brand ? `${food.brand} · ` : ''}
            {fmt(amount)} {food.unit} · P {fmt((food.protein * amount) / 100)} g
          </div>
        </div>
        {tag && <span className="tag">{tag}</span>}
        <span className="kcal num">
          {fmt((food.kcal * amount) / 100)}
          <small>kcal</small>
        </span>
      </button>
      {onDelete && (
        <button className="icon-btn" aria-label={`Eliminar ${food.name}`} onClick={onDelete}>
          <Trash2 size={18} color="var(--text-3)" />
        </button>
      )}
    </div>
  );
}

type Remote = { q: string; status: 'loading' | 'done' | 'error'; foods: Food[]; msg?: string };

export default function AddFood() {
  const { query } = useRoute();
  const mealParam = query.get('meal');
  const meal: MealId = isMealId(mealParam) ? mealParam : defaultMeal();
  const date = useUi((s) => s.date);
  const setDraft = useUi((s) => s.setDraft);
  const showToast = useUi((s) => s.showToast);
  const recents = useStore((s) => s.recents);
  const customFoods = useStore((s) => s.customFoods);
  const removeCustomFood = useStore((s) => s.removeCustomFood);
  const addEntry = useStore((s) => s.addEntry);
  const ai = useStore((s) => s.ai);
  const setAi = useStore((s) => s.setAi);

  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'recent' | 'mine'>('recent');
  const [online, setOnline] = useState<Remote | null>(null);
  const [aiRes, setAiRes] = useState<Remote | null>(null);
  const [quick, setQuick] = useState(query.get('quick') === '1');

  const term = q.trim();
  const local = useMemo(() => searchFoods(q, customFoods), [q, customFoods]);
  const searching = term.length >= 2;

  // Los productos envasados se buscan solos, un momento después de dejar de escribir.
  useEffect(() => {
    if (term.length < 3) {
      setOnline(null);
      return;
    }
    setOnline({ q: term, status: 'loading', foods: [] });
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const foods = await searchOnline(term, ctrl.signal);
        if (!ctrl.signal.aborted) setOnline({ q: term, status: 'done', foods });
      } catch {
        if (!ctrl.signal.aborted) setOnline({ q: term, status: 'error', foods: [] });
      }
    }, 700);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [term]);

  const open = (food: Food, grams?: number) => {
    setDraft({ food, grams: grams ?? food.portion?.grams ?? 100, meal });
    push('/food');
  };

  const askAi = async () => {
    setAiRes({ q: term, status: 'loading', foods: [] });
    try {
      const foods = await lookupFoods(ai, term, (geminiModel) => setAi({ geminiModel }));
      setAiRes({ q: term, status: 'done', foods });
    } catch (e) {
      setAiRes({ q: term, status: 'error', foods: [], msg: e instanceof AiError ? e.message : 'No se pudo consultar a la IA.' });
    }
  };

  const aiForQuery = aiRes && aiRes.q === term ? aiRes : null;

  return (
    <div className="screen">
      <Header title={`Agregar a ${mealLabel(meal)}`} />
      <div className="input-wrap">
        <Search size={20} color="var(--text-3)" />
        <input type="search" enterKeyHint="search" placeholder="Alimento, plato, producto o marca" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar alimento" />
        {q && (
          <button aria-label="Borrar búsqueda" onClick={() => setQ('')}>
            <X size={20} color="var(--text-3)" />
          </button>
        )}
      </div>

      <div className="chips">
        <button className="chip" onClick={() => push(`/scan?meal=${meal}`)}>
          <ScanBarcode size={16} /> Escanear
        </button>
        <button className="chip" onClick={() => push(`/photo?meal=${meal}`)}>
          <Camera size={16} /> Foto con IA
        </button>
        <button className="chip" onClick={() => setQuick(true)}>
          <Zap size={16} /> Rápido
        </button>
        <button className="chip" onClick={() => push(`/custom-food?meal=${meal}`)}>
          <PencilLine size={16} /> Crear alimento
        </button>
      </div>

      {searching ? (
        <>
          {local.length > 0 && (
            <>
              <h2 className="section-title">Alimentos</h2>
              <div className="card" style={{ paddingTop: 6, paddingBottom: 6 }}>
                <div className="list">
                  {local.slice(0, 12).map((f) => (
                    <FoodRow key={f.id} food={f} onClick={() => open(f)} />
                  ))}
                </div>
              </div>
            </>
          )}

          {online && (
            <>
              <h2 className="section-title">Productos envasados</h2>
              {online.status === 'loading' && <Spinner label="Buscando productos…" />}
              {online.status === 'error' && <div className="notice small">No se pudo buscar productos en línea. Revisa tu conexión.</div>}
              {online.status === 'done' &&
                (online.foods.length > 0 ? (
                  <div className="card" style={{ paddingTop: 6, paddingBottom: 6 }}>
                    <div className="list">
                      {online.foods.map((f) => (
                        <FoodRow key={f.id} food={f} onClick={() => open(f)} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="small muted">No hay productos envasados con ese nombre.</p>
                ))}
            </>
          )}

          <h2 className="section-title">Inteligencia artificial</h2>
          {!aiReady(ai) ? (
            <button className="notice small" style={{ textAlign: 'left' }} onClick={() => push('/ai')}>
              Configura tu clave de IA para buscar cualquier plato o producto por su nombre.
            </button>
          ) : aiForQuery?.status === 'loading' ? (
            <Spinner label="Consultando valores nutricionales…" />
          ) : aiForQuery?.status === 'done' && aiForQuery.foods.length > 0 ? (
            <>
              <div className="card" style={{ paddingTop: 6, paddingBottom: 6 }}>
                <div className="list">
                  {aiForQuery.foods.map((f) => (
                    <FoodRow key={f.id} food={f} tag="IA" onClick={() => open(f)} />
                  ))}
                </div>
              </div>
              <p className="xs muted">Valores entregados por la IA: son una referencia y pueden diferir de la etiqueta real.</p>
            </>
          ) : (
            <>
              {aiForQuery?.status === 'error' && (
                <div className="notice error small" role="alert">
                  {aiForQuery.msg}
                </div>
              )}
              {aiForQuery?.status === 'done' && <p className="small muted">La IA no reconoció «{term}» como un alimento.</p>}
              <button className="btn secondary" onClick={() => void askAi()}>
                <Sparkles size={18} /> Buscar «{term}» con IA
              </button>
            </>
          )}

          {local.length === 0 && !online && <p className="small muted">Sigue escribiendo para buscar también en productos envasados.</p>}
        </>
      ) : (
        <>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'recent', label: 'Recientes' },
              { value: 'mine', label: 'Mis alimentos' },
            ]}
          />
          <div className="card" style={{ paddingTop: 6, paddingBottom: 6 }}>
            {tab === 'recent' &&
              (recents.length > 0 ? (
                <div className="list">
                  {recents.map((r) => (
                    <FoodRow key={r.food.id} food={r.food} grams={r.grams} onClick={() => open(r.food, r.grams)} />
                  ))}
                </div>
              ) : (
                <p className="empty">Aquí aparecerán los alimentos que registres. Escribe arriba para buscar por nombre, escanea un producto o toma una foto de tu plato.</p>
              ))}
            {tab === 'mine' &&
              (customFoods.length > 0 ? (
                <div className="list">
                  {customFoods.map((f) => (
                    <FoodRow key={f.id} food={f} onClick={() => open(f)} onDelete={() => removeCustomFood(f.id)} />
                  ))}
                </div>
              ) : (
                <p className="empty">Todavía no has creado alimentos propios. Usa «Crear alimento» para guardar tus recetas o productos.</p>
              ))}
          </div>
        </>
      )}

      {quick && (
        <QuickAdd
          onClose={() => setQuick(false)}
          onAdd={(food) => {
            addEntry({ date, meal, food, grams: 100 });
            showToast(`Agregado a ${mealLabel(meal)}`);
            backToRoot();
          }}
        />
      )}
    </div>
  );
}

function QuickAdd({ onClose, onAdd }: { onClose: () => void; onAdd: (food: Food) => void }) {
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const k = parseNum(kcal);
  const valid = k !== null && k > 0 && k <= 10000;
  return (
    <Sheet title="Añadido rápido" onClose={onClose}>
      <p className="small muted">Registra calorías directamente cuando no necesitas buscar el alimento.</p>
      <Field label="Calorías" value={kcal} onChange={setKcal} suffix="kcal" numeric autoFocus />
      <Field label="Descripción (opcional)" value={name} onChange={setName} placeholder="Ej: almuerzo en restaurante" />
      <div className="row">
        <Field label="Proteínas" value={protein} onChange={setProtein} suffix="g" numeric />
        <Field label="Carbos" value={carbs} onChange={setCarbs} suffix="g" numeric />
        <Field label="Grasas" value={fat} onChange={setFat} suffix="g" numeric />
      </div>
      <button
        className="btn"
        disabled={!valid}
        onClick={() =>
          onAdd({
            id: `quick-${uid()}`,
            name: name.trim() || 'Añadido rápido',
            kcal: k ?? 0,
            protein: Math.max(0, parseNum(protein) ?? 0),
            carbs: Math.max(0, parseNum(carbs) ?? 0),
            fat: Math.max(0, parseNum(fat) ?? 0),
            unit: 'g',
            source: 'quick',
          })
        }
      >
        Agregar
      </button>
    </Sheet>
  );
}
