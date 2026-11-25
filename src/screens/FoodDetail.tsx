import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FoodThumb, Header } from '../components/ui';
import { MEALS, mealLabel } from '../lib/meals';
import { macrosFor } from '../lib/nutrition';
import { fmt, parseNum } from '../lib/util';
import { back, backToRoot } from '../router';
import { useStore, useUi } from '../store';

const SOURCE_LABEL = {
  base: 'Base de alimentos',
  off: 'Datos de la etiqueta · Open Food Facts',
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
  const g = valid ? grams : 0;
  const m = macrosFor(food, g);
  const portion = food.portion;
  const scale = (v: number | undefined) => (v === undefined ? undefined : (v * g) / 100);

  // Reparto de las calorías entre los tres macronutrientes.
  const kcalP = m.protein * 4;
  const kcalC = m.carbs * 4;
  const kcalF = m.fat * 9;
  const kcalSum = kcalP + kcalC + kcalF;
  const share = (v: number) => (kcalSum > 0 ? Math.round((v / kcalSum) * 100) : 0);
  const macros = [
    { label: 'Proteínas', grams: m.protein, pct: share(kcalP), color: 'var(--protein)' },
    { label: 'Carbohidratos', grams: m.carbs, pct: share(kcalC), color: 'var(--carbs)' },
    { label: 'Grasas', grams: m.fat, pct: share(kcalF), color: 'var(--fat)' },
  ];

  const presets: { label: string; grams: number }[] = portion
    ? [
        { label: `½ · ${fmt(portion.grams / 2)} ${food.unit}`, grams: portion.grams / 2 },
        { label: `${portion.label} · ${fmt(portion.grams)} ${food.unit}`, grams: portion.grams },
        { label: `×2 · ${fmt(portion.grams * 2)} ${food.unit}`, grams: portion.grams * 2 },
        { label: `100 ${food.unit}`, grams: 100 },
      ]
    : [50, 100, 150, 200, 300].map((x) => ({ label: `${x} ${food.unit}`, grams: x }));

  const detail: { label: string; value: number | undefined; unit: string; sub?: boolean; bold?: boolean }[] = [
    { label: 'Energía', value: m.kcal, unit: 'kcal', bold: true },
    { label: 'Proteínas', value: m.protein, unit: 'g', bold: true },
    { label: 'Carbohidratos', value: m.carbs, unit: 'g', bold: true },
    { label: 'Azúcares', value: scale(food.sugars), unit: 'g', sub: true },
    { label: 'Grasas', value: m.fat, unit: 'g', bold: true },
    { label: 'Saturadas', value: scale(food.satFat), unit: 'g', sub: true },
    { label: 'Fibra', value: scale(food.fiber), unit: 'g', bold: true },
    { label: 'Sodio', value: scale(food.sodium), unit: 'mg', bold: true },
  ];

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
        <div className="row" style={{ gap: 14 }}>
          <FoodThumb name={food.name} image={food.image} large />
          <div className="grow">
            <h2 className="title-xl" style={{ fontSize: 21 }}>
              {food.name}
            </h2>
            <p className="small muted">
              {food.brand ? `${food.brand} · ` : ''}
              {SOURCE_LABEL[food.source]}
            </p>
            {food.barcode && <p className="xs muted num">Código {food.barcode}</p>}
          </div>
        </div>

        <div className="card col" style={{ gap: 14 }}>
          <div className="row spread" style={{ alignItems: 'baseline' }}>
            <p className="num" style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>
              {fmt(m.kcal)} <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: 0 }}>kcal</span>
            </p>
            {!isQuick && (
              <span className="small muted num">
                en {fmt(g, 1)} {food.unit}
              </span>
            )}
          </div>
          <div className="dist-bar" role="img" aria-label={macros.map((x) => `${x.label} ${x.pct}%`).join(', ')}>
            {macros.map((x) => (
              <div key={x.label} style={{ width: `${x.pct}%`, background: x.color }} />
            ))}
          </div>
          <div className="row spread">
            {macros.map((x) => (
              <div key={x.label} className="stat grow">
                <span className="v num">
                  {fmt(x.grams, 1)} g <span className="muted xs" style={{ fontWeight: 700 }}>{x.pct}%</span>
                </span>
                <span className="l row" style={{ gap: 5 }}>
                  <span className="dot" style={{ background: x.color }} />
                  {x.label}
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

        {!isQuick && (
          <div className="card">
            <div className="row spread">
              <h3 className="card-title">Información nutricional</h3>
              <span className="xs muted num">
                por {fmt(g, 1)} {food.unit}
              </span>
            </div>
            <div className="nutri-table" style={{ marginTop: 6 }}>
              {detail
                .filter((d) => d.value !== undefined)
                .map((d) => (
                  <div key={d.label} className={`r ${d.sub ? 'sub' : ''}`}>
                    <span>{d.label}</span>
                    <span className="num" style={{ fontWeight: d.bold ? 800 : 600 }}>
                      {fmt(d.value ?? 0, d.unit === 'g' ? 1 : 0)} {d.unit}
                    </span>
                  </div>
                ))}
            </div>
            <p className="xs muted num" style={{ marginTop: 8 }}>
              Por 100 {food.unit}: {fmt(food.kcal)} kcal · P {fmt(food.protein, 1)} g · C {fmt(food.carbs, 1)} g · G {fmt(food.fat, 1)} g
            </p>
          </div>
        )}
      </div>
      <div className="footer-bar">
        <button className="btn" disabled={!valid} onClick={save}>
          {entryId ? 'Guardar cambios' : `Agregar a ${mealLabel(meal)}`}
        </button>
      </div>
    </>
  );
}
