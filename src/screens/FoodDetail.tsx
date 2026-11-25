import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Header } from '../components/ui';
import { MEALS, mealLabel } from '../lib/meals';
import { macrosFor } from '../lib/nutrition';
import { fmt, parseNum } from '../lib/util';
import { back, backToRoot } from '../router';
import { useStore, useUi } from '../store';

const SOURCE_LABEL = {
  base: 'Base de alimentos',
  off: 'Open Food Facts',
  custom: 'Mis alimentos',
  ai: 'Estimado con IA',
  quick: 'Añadido rápido',
};

export default function FoodDetail() {
  const draft = useUi((s) => s.draft);
  const date = useUi((s) => s.date);
  const showToast = useUi((s) => s.showToast);
  const addEntry = useStore((s) => s.addEntry);
  const updateEntry = useStore((s) => s.updateEntry);
  const removeEntry = useStore((s) => s.removeEntry);
  const [amount, setAmount] = useState(draft ? fmt(draft.grams, 1) : '100');
  const [meal, setMeal] = useState(draft?.meal ?? 'lunch');

  useEffect(() => {
    // Si se recarga la app en esta pantalla ya no hay alimento seleccionado.
    if (!draft) back();
  }, [draft]);
  if (!draft) return null;

  const { food, entryId } = draft;
  const isQuick = food.source === 'quick';
  const grams = isQuick ? 100 : parseNum(amount);
  const valid = grams !== null && grams > 0 && grams <= 5000;
  const m = macrosFor(food, valid ? grams : 0);
  const portion = food.portion;

  const presets: { label: string; grams: number }[] = portion
    ? [
        { label: `½ · ${fmt(portion.grams / 2)} ${food.unit}`, grams: portion.grams / 2 },
        { label: `${portion.label} · ${fmt(portion.grams)} ${food.unit}`, grams: portion.grams },
        { label: `×2 · ${fmt(portion.grams * 2)} ${food.unit}`, grams: portion.grams * 2 },
        { label: `100 ${food.unit}`, grams: 100 },
      ]
    : [50, 100, 150, 200, 300].map((g) => ({ label: `${g} ${food.unit}`, grams: g }));

  const save = () => {
    if (!valid) return;
    if (entryId) {
      updateEntry(entryId, { grams, meal });
      showToast('Registro actualizado');
    } else {
      addEntry({ date, meal, food, grams });
      showToast(`Agregado a ${mealLabel(meal)}`);
    }
    backToRoot();
  };

  const remove = () => {
    if (!entryId) return;
    removeEntry(entryId);
    showToast('Registro eliminado');
    backToRoot();
  };

  return (
    <>
      <div className="screen with-footer">
        <Header
          title={entryId ? 'Editar registro' : 'Agregar alimento'}
          right={
            entryId && (
              <button className="icon-btn" aria-label="Eliminar registro" onClick={remove}>
                <Trash2 size={20} color="var(--critical)" />
              </button>
            )
          }
        />
        <div>
          <h2 className="title-xl" style={{ fontSize: 22 }}>
            {food.name}
          </h2>
          <p className="small muted">
            {food.brand ? `${food.brand} · ` : ''}
            {SOURCE_LABEL[food.source]}
          </p>
        </div>

        <div className="card center">
          <p className="num" style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em' }}>
            {fmt(m.kcal)} <span style={{ fontSize: 16, fontWeight: 600 }}>kcal</span>
          </p>
          <div className="row spread" style={{ marginTop: 10 }}>
            {(
              [
                ['Proteínas', m.protein, 'var(--protein)'],
                ['Carbohidratos', m.carbs, 'var(--carbs)'],
                ['Grasas', m.fat, 'var(--fat)'],
              ] as const
            ).map(([label, v, color]) => (
              <div key={label} className="stat grow">
                <span className="v num">{fmt(v, 1)} g</span>
                <span className="l row" style={{ justifyContent: 'center', gap: 5 }}>
                  <span className="dot" style={{ background: color }} />
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {!isQuick && (
          <>
            <label className="field">
              <span>Cantidad</span>
              <div className="input-wrap">
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} onFocus={(e) => e.target.select()} aria-label="Cantidad" />
                <span className="suffix">{food.unit === 'ml' ? 'ml' : 'gramos'}</span>
              </div>
            </label>
            <div className="chips">
              {presets.map((p) => (
                <button key={p.label} className={`chip ${grams === p.grams ? 'active' : ''}`} onClick={() => setAmount(fmt(p.grams, 1))}>
                  {p.label}
                </button>
              ))}
            </div>
            <p className="xs muted num">
              Por 100 {food.unit}: {fmt(food.kcal)} kcal · P {fmt(food.protein, 1)} g · C {fmt(food.carbs, 1)} g · G {fmt(food.fat, 1)} g
            </p>
          </>
        )}

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
      </div>
      <div className="footer-bar">
        <button className="btn" disabled={!valid} onClick={save}>
          {entryId ? 'Guardar cambios' : `Agregar a ${mealLabel(meal)}`}
        </button>
      </div>
    </>
  );
}
