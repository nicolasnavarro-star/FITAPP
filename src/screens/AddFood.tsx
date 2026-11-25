import { Camera, Globe, PencilLine, ScanBarcode, Search, Trash2, X, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Field, Header, Segmented, Sheet, Spinner } from '../components/ui';
import { searchFoods } from '../lib/foods';
import { defaultMeal, isMealId, mealLabel } from '../lib/meals';
import { searchOnline } from '../lib/off';
import type { Food, MealId } from '../lib/types';
import { fmt, parseNum, uid } from '../lib/util';
import { backToRoot, push, useRoute } from '../router';
import { useStore, useUi } from '../store';

function FoodRow({ food, grams, onClick, onDelete }: { food: Food; grams?: number; onClick: () => void; onDelete?: () => void }) {
  const amount = grams ?? food.portion?.grams ?? 100;
  return (
    <div className="list-item" style={{ padding: 0 }}>
      <button className="row grow" style={{ textAlign: 'left', padding: '12px 0', minHeight: 56 }} onClick={onClick}>
        <div className="grow">
          <div className="name">{food.name}</div>
          <div className="sub">
            {food.brand ? `${food.brand} · ` : ''}
            {fmt(amount)} {food.unit}
          </div>
        </div>
        <span className="kcal num">{fmt((food.kcal * amount) / 100)} kcal</span>
      </button>
      {onDelete && (
        <button className="icon-btn" aria-label={`Eliminar ${food.name}`} onClick={onDelete}>
          <Trash2 size={18} color="var(--text-3)" />
        </button>
      )}
    </div>
  );
}

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

  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'recent' | 'mine'>('recent');
  const [online, setOnline] = useState<{ q: string; status: 'loading' | 'done' | 'error'; foods: Food[] } | null>(null);
  const [quick, setQuick] = useState(false);

  const local = useMemo(() => searchFoods(q, customFoods), [q, customFoods]);
  const searching = q.trim().length >= 2;

  const open = (food: Food, grams?: number) => {
    setDraft({ food, grams: grams ?? food.portion?.grams ?? 100, meal });
    push('/food');
  };

  const runOnline = async () => {
    const term = q.trim();
    setOnline({ q: term, status: 'loading', foods: [] });
    try {
      const foods = await searchOnline(term);
      setOnline({ q: term, status: 'done', foods });
    } catch {
      setOnline({ q: term, status: 'error', foods: [] });
    }
  };

  const onlineForQuery = online && online.q === q.trim() ? online : null;

  return (
    <div className="screen">
      <Header title={`Agregar a ${mealLabel(meal)}`} />
      <div className="input-wrap">
        <Search size={20} color="var(--text-3)" />
        <input
          type="search"
          enterKeyHint="search"
          placeholder="Buscar alimento o marca"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && searching && void runOnline()}
          aria-label="Buscar alimento"
        />
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
          <div className="card">
            {local.length > 0 ? (
              <div className="list">
                {local.map((f) => (
                  <FoodRow key={f.id} food={f} onClick={() => open(f)} />
                ))}
              </div>
            ) : (
              <p className="empty">No hay coincidencias en la base local.</p>
            )}
          </div>

          {!onlineForQuery && (
            <button className="btn secondary" onClick={() => void runOnline()}>
              <Globe size={18} /> Buscar «{q.trim()}» en productos envasados
            </button>
          )}
          {onlineForQuery?.status === 'loading' && <Spinner label="Buscando en Open Food Facts…" />}
          {onlineForQuery?.status === 'error' && (
            <div className="notice error">
              No se pudo buscar en línea. Revisa tu conexión e{' '}
              <button className="link" onClick={() => void runOnline()}>
                intenta de nuevo
              </button>
              .
            </div>
          )}
          {onlineForQuery?.status === 'done' && (
            <div className="card">
              <h2 className="card-title">Productos envasados</h2>
              {onlineForQuery.foods.length > 0 ? (
                <div className="list">
                  {onlineForQuery.foods.map((f) => (
                    <FoodRow key={f.id} food={f} onClick={() => open(f)} />
                  ))}
                </div>
              ) : (
                <p className="empty">Sin resultados en línea. Puedes crear el alimento a mano o usar la foto con IA.</p>
              )}
            </div>
          )}
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
          <div className="card">
            {tab === 'recent' &&
              (recents.length > 0 ? (
                <div className="list">
                  {recents.map((r) => (
                    <FoodRow key={r.food.id} food={r.food} grams={r.grams} onClick={() => open(r.food, r.grams)} />
                  ))}
                </div>
              ) : (
                <p className="empty">Aquí aparecerán los alimentos que registres. Busca uno arriba, escanea un producto o toma una foto de tu plato.</p>
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
