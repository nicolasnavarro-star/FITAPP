import { useState } from 'react';
import { Field, Header, Segmented } from '../components/ui';
import { computeTargets } from '../lib/nutrition';
import { fmt, parseNum } from '../lib/util';
import { back } from '../router';
import { useCurrentWeight, useStore, useUi } from '../store';

export default function TargetsScreen() {
  const profile = useStore((s) => s.profile)!;
  const override = useStore((s) => s.targetsOverride);
  const setOverride = useStore((s) => s.setTargetsOverride);
  const showToast = useUi((s) => s.showToast);
  const weight = useCurrentWeight();
  const auto = computeTargets(profile, weight);
  const [mode, setMode] = useState<'auto' | 'manual'>(override ? 'manual' : 'auto');
  const init = override ?? auto;
  const [kcal, setKcal] = useState(String(init.kcal));
  const [protein, setProtein] = useState(String(init.protein));
  const [carbs, setCarbs] = useState(String(init.carbs));
  const [fat, setFat] = useState(String(init.fat));
  const [error, setError] = useState('');

  const p = parseNum(protein) ?? 0;
  const c = parseNum(carbs) ?? 0;
  const f = parseNum(fat) ?? 0;
  const fromMacros = p * 4 + c * 4 + f * 9;

  const save = () => {
    if (mode === 'auto') {
      setOverride(null);
    } else {
      const k = parseNum(kcal);
      if (k === null || k < 1000 || k > 6000) return setError('Ingresa una meta entre 1.000 y 6.000 kcal.');
      if ([p, c, f].some((v) => v < 0 || v > 1000)) return setError('Revisa los gramos de cada macronutriente.');
      setOverride({ kcal: Math.round(k), protein: Math.round(p), carbs: Math.round(c), fat: Math.round(f) });
    }
    showToast('Metas actualizadas');
    back();
  };

  return (
    <>
      <div className="screen with-footer">
        <Header title="Metas diarias" />
        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError('');
          }}
          options={[
            { value: 'auto', label: 'Automáticas' },
            { value: 'manual', label: 'Personalizadas' },
          ]}
        />

        {mode === 'auto' ? (
          <div className="card col">
            <p className="small muted">Se calculan con tu peso actual, altura, edad, actividad y objetivo, y se actualizan solas cada vez que registras tu peso.</p>
            <p className="num" style={{ fontSize: 34, fontWeight: 800 }}>
              {fmt(auto.kcal)} <span style={{ fontSize: 15, fontWeight: 600 }}>kcal</span>
            </p>
            <p className="small num">
              Proteínas {auto.protein} g · Carbohidratos {auto.carbs} g · Grasas {auto.fat} g
            </p>
          </div>
        ) : (
          <>
            <p className="small muted">Usa tus propias metas, por ejemplo las que te indicó tu nutricionista.</p>
            <Field label="Calorías" value={kcal} onChange={setKcal} suffix="kcal" numeric />
            <div className="row">
              <Field label="Proteínas" value={protein} onChange={setProtein} suffix="g" numeric />
              <Field label="Carbos" value={carbs} onChange={setCarbs} suffix="g" numeric />
              <Field label="Grasas" value={fat} onChange={setFat} suffix="g" numeric />
            </div>
            <p className="xs muted num">Tus macros suman {fmt(fromMacros)} kcal.</p>
          </>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="footer-bar">
        <button className="btn" onClick={save}>
          Guardar
        </button>
      </div>
    </>
  );
}
