import { useState } from 'react';
import { Field, Header, Segmented } from '../components/ui';
import { defaultMeal, isMealId } from '../lib/meals';
import type { Food, MealId } from '../lib/types';
import { parseNum, uid } from '../lib/util';
import { replace, useRoute } from '../router';
import { useStore, useUi } from '../store';

export default function CustomFood() {
  const { query } = useRoute();
  const mealParam = query.get('meal');
  const meal: MealId = isMealId(mealParam) ? mealParam : defaultMeal();
  const barcode = query.get('barcode') ?? undefined;
  const saveCustomFood = useStore((s) => s.saveCustomFood);
  const setDraft = useUi((s) => s.setDraft);
  const showToast = useUi((s) => s.showToast);

  const [name, setName] = useState(query.get('name') ?? '');
  const [brand, setBrand] = useState('');
  const [unit, setUnit] = useState<'g' | 'ml'>('g');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [portion, setPortion] = useState('');
  const [error, setError] = useState('');

  const save = () => {
    const k = parseNum(kcal);
    const p = parseNum(protein) ?? 0;
    const c = parseNum(carbs) ?? 0;
    const f = parseNum(fat) ?? 0;
    const por = parseNum(portion);
    if (name.trim().length < 2) return setError('Escribe el nombre del alimento.');
    if (k === null || k < 0 || k > 900) return setError(`Ingresa las calorías por 100 ${unit} (entre 0 y 900).`);
    if ([p, c, f].some((v) => v < 0 || v > 100) || p + c + f > 100.5) return setError(`Los macros por 100 ${unit} no pueden sumar más de 100 g.`);
    if (por !== null && (por <= 0 || por > 2000)) return setError('La porción debe estar entre 1 y 2000.');
    const food: Food = {
      id: `custom-${uid()}`,
      name: name.trim(),
      brand: brand.trim() || undefined,
      kcal: k,
      protein: p,
      carbs: c,
      fat: f,
      unit,
      portion: por ? { label: '1 porción', grams: por } : undefined,
      barcode,
      source: 'custom',
    };
    saveCustomFood(food);
    showToast('Alimento guardado en Mis alimentos');
    setDraft({ food, grams: por ?? 100, meal });
    replace('/food');
  };

  return (
    <>
      <div className="screen with-footer">
        <Header title="Crear alimento" />
        {barcode && <div className="notice small">Código de barras {barcode}: la próxima vez que lo escanees se reconocerá automáticamente.</div>}
        <Field label="Nombre" value={name} onChange={setName} placeholder="Ej: Granola casera" />
        <Field label="Marca (opcional)" value={brand} onChange={setBrand} />
        <div className="field">
          <span>Se mide en</span>
          <Segmented
            value={unit}
            onChange={setUnit}
            options={[
              { value: 'g', label: 'Gramos' },
              { value: 'ml', label: 'Mililitros' },
            ]}
          />
        </div>
        <p className="small muted">Valores por 100 {unit}, tal como aparecen en la etiqueta nutricional:</p>
        <Field label="Calorías" value={kcal} onChange={setKcal} suffix="kcal" numeric />
        <div className="row">
          <Field label="Proteínas" value={protein} onChange={setProtein} suffix="g" numeric />
          <Field label="Carbos" value={carbs} onChange={setCarbs} suffix="g" numeric />
          <Field label="Grasas" value={fat} onChange={setFat} suffix="g" numeric />
        </div>
        <Field label="Tamaño de la porción (opcional)" value={portion} onChange={setPortion} suffix={unit} numeric placeholder="Ej: 30" />
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="footer-bar">
        <button className="btn" onClick={save}>
          Guardar alimento
        </button>
      </div>
    </>
  );
}
