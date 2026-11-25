import { Camera, ImagePlus, ScanText } from 'lucide-react';
import { useRef, useState } from 'react';
import { Field, Header, Segmented, Spinner } from '../components/ui';
import { AiError, aiReady, prepareImage, readLabel } from '../lib/ai';
import { defaultMeal, isMealId } from '../lib/meals';
import type { Food, MealId } from '../lib/types';
import { parseNum, uid } from '../lib/util';
import { push, replace, useRoute } from '../router';
import { useStore, useUi } from '../store';

const show = (v: number | undefined) => (v === undefined ? '' : String(v).replace('.', ','));

export default function CustomFood() {
  const { query } = useRoute();
  const mealParam = query.get('meal');
  const meal: MealId = isMealId(mealParam) ? mealParam : defaultMeal();
  const barcode = query.get('barcode') ?? undefined;
  const saveCustomFood = useStore((s) => s.saveCustomFood);
  const ai = useStore((s) => s.ai);
  const setAi = useStore((s) => s.setAi);
  const setDraft = useUi((s) => s.setDraft);
  const showToast = useUi((s) => s.showToast);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(query.get('name') ?? '');
  const [brand, setBrand] = useState('');
  const [unit, setUnit] = useState<'g' | 'ml'>('g');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [sugars, setSugars] = useState('');
  const [satFat, setSatFat] = useState('');
  const [fiber, setFiber] = useState('');
  const [sodium, setSodium] = useState('');
  const [portion, setPortion] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [fromLabel, setFromLabel] = useState(false);

  const onLabel = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setError('');
    try {
      const img = await prepareImage(file, 1600);
      const f = await readLabel(ai, img.base64, (geminiModel) => setAi({ geminiModel }));
      if (f.name) setName(f.name);
      if (f.brand) setBrand(f.brand);
      setUnit(f.unit);
      setKcal(show(f.kcal));
      setProtein(show(f.protein));
      setCarbs(show(f.carbs));
      setFat(show(f.fat));
      setSugars(show(f.sugars));
      setSatFat(show(f.satFat));
      setFiber(show(f.fiber));
      setSodium(show(f.sodium));
      setPortion(show(f.portion?.grams));
      setFromLabel(true);
    } catch (e) {
      setError(e instanceof AiError ? e.message : 'No se pudo leer la etiqueta. Intenta de nuevo.');
    } finally {
      setReading(false);
    }
  };

  const save = () => {
    const k = parseNum(kcal);
    const p = parseNum(protein) ?? 0;
    const c = parseNum(carbs) ?? 0;
    const f = parseNum(fat) ?? 0;
    const por = parseNum(portion);
    const optional = (s: string, max: number) => {
      const v = parseNum(s);
      return v !== null && v >= 0 && v <= max ? v : undefined;
    };
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
      sugars: optional(sugars, 100),
      satFat: optional(satFat, 100),
      fiber: optional(fiber, 100),
      sodium: optional(sodium, 40000),
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

        <div className="card col">
          <div className="row">
            <span className="badge">
              <ScanText size={20} />
            </span>
            <div className="grow">
              <h2 className="card-title">Leer la etiqueta con una foto</h2>
              <p className="small muted">Saca una foto a la tabla nutricional del envase y se completan los valores exactos.</p>
            </div>
          </div>
          {reading ? (
            <Spinner label="Leyendo la etiqueta…" />
          ) : aiReady(ai) ? (
            <div className="row">
              <button className="btn sm grow" onClick={() => cameraRef.current?.click()}>
                <Camera size={18} /> Tomar foto
              </button>
              <button className="btn sm secondary grow" onClick={() => galleryRef.current?.click()}>
                <ImagePlus size={18} /> Galería
              </button>
            </div>
          ) : (
            <button className="btn sm secondary" onClick={() => push('/ai')}>
              Configurar la IA para usar esta función
            </button>
          )}
          {fromLabel && !reading && (
            <div className="notice small" role="status">
              Datos leídos de la etiqueta. Revísalos y corrige lo que haga falta antes de guardar.
            </div>
          )}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              void onLabel(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void onLabel(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>

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
        <h2 className="section-title">Valores por 100 {unit}</h2>
        <Field label="Calorías" value={kcal} onChange={setKcal} suffix="kcal" numeric />
        <div className="row">
          <Field label="Proteínas" value={protein} onChange={setProtein} suffix="g" numeric />
          <Field label="Carbos" value={carbs} onChange={setCarbs} suffix="g" numeric />
          <Field label="Grasas" value={fat} onChange={setFat} suffix="g" numeric />
        </div>
        <h2 className="section-title">Detalle opcional</h2>
        <div className="row">
          <Field label="Azúcares" value={sugars} onChange={setSugars} suffix="g" numeric />
          <Field label="Grasas saturadas" value={satFat} onChange={setSatFat} suffix="g" numeric />
        </div>
        <div className="row">
          <Field label="Fibra" value={fiber} onChange={setFiber} suffix="g" numeric />
          <Field label="Sodio" value={sodium} onChange={setSodium} suffix="mg" numeric />
        </div>
        <Field label="Tamaño de la porción" value={portion} onChange={setPortion} suffix={unit} numeric placeholder="Ej: 30" />
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="footer-bar">
        <button className="btn" disabled={reading} onClick={save}>
          Guardar alimento
        </button>
      </div>
    </>
  );
}
