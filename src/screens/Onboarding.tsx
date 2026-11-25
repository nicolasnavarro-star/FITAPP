import { ArrowRight, Mountain, Scale, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import logoUrl from '../assets/logo.jpg';
import { Field, Header, OptionCard, Segmented } from '../components/ui';
import { ACTIVITY, GOALS, bmi, computeTargets, weeksToGoal } from '../lib/nutrition';
import type { Activity, Goal, Profile, Sex } from '../lib/types';
import { fmt, parseNum, todayKey } from '../lib/util';
import { back } from '../router';
import { currentWeight, useStore, useUi } from '../store';

const GOAL_ICONS = { lose: TrendingDown, maintain: Scale, gain: TrendingUp };
const RATES: Record<Goal, number[]> = { lose: [0.25, 0.5, 0.75, 1], gain: [0.25, 0.5], maintain: [] };

export default function Onboarding({ editing = false }: { editing?: boolean }) {
  const store = useStore();
  const showToast = useUi((s) => s.showToast);
  const existing = store.profile;
  const [step, setStep] = useState(editing ? 1 : 0);
  const [name, setName] = useState(existing?.name ?? '');
  const [sex, setSex] = useState<Sex>(existing?.sex ?? 'male');
  const [age, setAge] = useState(existing ? String(existing.age) : '');
  const [height, setHeight] = useState(existing ? String(existing.heightCm) : '');
  const [weight, setWeight] = useState(existing ? fmt(currentWeight(store), 1) : '');
  const [activity, setActivity] = useState<Activity>(existing?.activity ?? 'light');
  const [goal, setGoal] = useState<Goal>(existing?.goal ?? 'lose');
  const [target, setTarget] = useState(existing ? fmt(existing.targetWeightKg, 1) : '');
  const [rate, setRate] = useState(existing?.weeklyRateKg || 0.5);
  const [error, setError] = useState('');

  useEffect(() => setError(''), [age, height, weight, target, goal]);

  const ageN = parseNum(age);
  const heightN = parseNum(height);
  const weightN = parseNum(weight);
  const targetN = parseNum(target);
  const lastStep = 4;

  const draft = (): Profile | null => {
    if (ageN === null || heightN === null || weightN === null) return null;
    return {
      name: name.trim(),
      sex,
      age: Math.round(ageN),
      heightCm: heightN,
      startWeightKg: existing?.startWeightKg ?? weightN,
      activity,
      goal,
      targetWeightKg: goal === 'maintain' ? weightN : (targetN ?? weightN),
      weeklyRateKg: goal === 'maintain' ? 0 : RATES[goal].includes(rate) ? rate : RATES[goal][0],
    };
  };

  const validate = (): string => {
    if (step === 1) {
      if (ageN === null || ageN < 18 || ageN > 99) return 'Ingresa una edad entre 18 y 99 años.';
      if (heightN === null || heightN < 120 || heightN > 230) return 'Ingresa una altura entre 120 y 230 cm.';
      if (weightN === null || weightN < 35 || weightN > 300) return 'Ingresa un peso entre 35 y 300 kg.';
    }
    if (step === 3 && goal !== 'maintain' && weightN !== null && heightN !== null) {
      if (targetN === null) return 'Ingresa tu peso objetivo.';
      if (goal === 'lose' && targetN >= weightN) return 'Para definición, el peso objetivo debe ser menor que tu peso actual.';
      if (goal === 'gain' && targetN <= weightN) return 'Para ganar músculo, el peso objetivo debe ser mayor que tu peso actual.';
      const h = heightN / 100;
      const minHealthy = 18.5 * h * h;
      if (targetN < minHealthy) return `Ese peso queda bajo el rango saludable para tu altura (mínimo ${fmt(minHealthy, 1)} kg).`;
      if (targetN > 300) return 'Ingresa un peso objetivo válido.';
    }
    return '';
  };

  const next = () => {
    const err = validate();
    setError(err);
    if (err) return;
    if (step < lastStep) {
      setStep(step + 1);
      return;
    }
    const p = draft();
    if (!p || weightN === null) return;
    store.setProfile(p);
    if (!existing || Math.abs(currentWeight(store) - weightN) >= 0.05) store.logWeight(todayKey(), weightN);
    if (editing) {
      showToast('Perfil actualizado');
      back();
    }
  };

  const prev = () => {
    setError('');
    if (step > (editing ? 1 : 0)) setStep(step - 1);
    else if (editing) back();
  };

  const p = draft();
  const targets = p && weightN !== null ? computeTargets(p, weightN) : null;
  const weeks = p && weightN !== null ? weeksToGoal(p, weightN) : null;

  return (
    <>
      <div className="screen with-footer">
        {step === 0 ? (
          <div style={{ height: 8 }} />
        ) : (
          <>
            <Header title={editing ? 'Editar perfil' : 'Tu plan'} onBack={prev} />
            <div className="steps" aria-hidden>
              {[1, 2, 3, 4].map((i) => (
                <i key={i} className={i <= step ? 'on' : ''} />
              ))}
            </div>
          </>
        )}

        {step === 0 && (
          <div className="col" style={{ gap: 18, marginTop: 24 }}>
            <img src={logoUrl} alt="Kaizen Health & Fitness" style={{ width: '100%', maxWidth: 300, aspectRatio: '1', alignSelf: 'center', borderRadius: 28, objectFit: 'cover' }} />
            <h1 className="title-xl">Bienvenido a Kaizen</h1>
            <p className="muted">Cuenta calorías con ayuda de IA, sigue tu progreso y entrena con rutinas hechas para tu objetivo. Todo queda guardado en tu teléfono.</p>
            <div className="col">
              <div className="row small">
                <Sparkles size={18} color="var(--accent)" /> Foto de tu plato → calorías y macros
              </div>
              <div className="row small">
                <Scale size={18} color="var(--accent)" /> Metas de definición o volumen a tu medida
              </div>
              <div className="row small">
                <TrendingUp size={18} color="var(--accent)" /> Rutinas y registro de entrenamientos
              </div>
              <div className="row small">
                <Mountain size={18} color="var(--accent)" /> Rutas de cerro con GPS, desnivel y clima
              </div>
            </div>
            <Field label="¿Cómo te llamas? (opcional)" value={name} onChange={setName} placeholder="Tu nombre" />
          </div>
        )}

        {step === 1 && (
          <div className="col" style={{ gap: 14 }}>
            <h2 className="title-xl">Sobre ti</h2>
            <p className="muted small">Con estos datos se calcula cuánta energía gasta tu cuerpo cada día.</p>
            {editing && <Field label="Nombre" value={name} onChange={setName} placeholder="Tu nombre" />}
            <div className="field">
              <span>Sexo biológico</span>
              <Segmented
                value={sex}
                onChange={setSex}
                options={[
                  { value: 'male', label: 'Hombre' },
                  { value: 'female', label: 'Mujer' },
                ]}
              />
            </div>
            <Field label="Edad" value={age} onChange={setAge} suffix="años" numeric placeholder="30" />
            <Field label="Altura" value={height} onChange={setHeight} suffix="cm" numeric placeholder="170" />
            <Field label="Peso actual" value={weight} onChange={setWeight} suffix="kg" numeric placeholder="70" />
          </div>
        )}

        {step === 2 && (
          <div className="col">
            <h2 className="title-xl">Nivel de actividad</h2>
            <p className="muted small">Considera tu trabajo y el ejercicio que haces en una semana normal.</p>
            {(Object.keys(ACTIVITY) as Activity[]).map((a) => (
              <OptionCard key={a} active={activity === a} title={ACTIVITY[a].label} desc={ACTIVITY[a].desc} onClick={() => setActivity(a)} />
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="col">
            <h2 className="title-xl">Tu objetivo</h2>
            {(Object.keys(GOALS) as Goal[]).map((g) => {
              const Icon = GOAL_ICONS[g];
              return (
                <OptionCard
                  key={g}
                  active={goal === g}
                  title={GOALS[g].label}
                  desc={GOALS[g].desc}
                  icon={<Icon size={20} />}
                  onClick={() => {
                    setGoal(g);
                    setError('');
                    if (g !== 'maintain' && !RATES[g].includes(rate)) setRate(g === 'gain' ? 0.25 : 0.5);
                  }}
                />
              );
            })}
            {goal !== 'maintain' && (
              <>
                <Field label="Peso objetivo" value={target} onChange={setTarget} suffix="kg" numeric placeholder={goal === 'lose' ? '65' : '75'} />
                <div className="field">
                  <span>Ritmo por semana</span>
                  <Segmented value={rate} onChange={setRate} options={RATES[goal].map((r) => ({ value: r, label: `${fmt(r, 2)} kg` }))} />
                  <p className="xs muted">
                    {goal === 'lose'
                      ? 'Recomendado: 0,5 kg por semana. Un ritmo más rápido cuesta más de sostener y arriesga masa muscular.'
                      : 'Recomendado: 0,25 kg por semana para ganar músculo con poca grasa.'}
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {step === 4 && targets && p && weightN !== null && heightN !== null && (
          <div className="col" style={{ gap: 14 }}>
            <h2 className="title-xl">{editing ? 'Tus nuevas metas' : 'Tu plan está listo'}</h2>
            <div className="card center">
              <p className="muted small">Meta diaria</p>
              <p className="num" style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.03em' }}>
                {fmt(targets.kcal)} <span style={{ fontSize: 18, fontWeight: 600 }}>kcal</span>
              </p>
              <div className="row spread" style={{ marginTop: 12 }}>
                {(
                  [
                    ['Proteínas', targets.protein, 'var(--protein)'],
                    ['Carbohidratos', targets.carbs, 'var(--carbs)'],
                    ['Grasas', targets.fat, 'var(--fat)'],
                  ] as const
                ).map(([label, v, color]) => (
                  <div key={label} className="stat grow">
                    <span className="v num">{v} g</span>
                    <span className="l row" style={{ justifyContent: 'center', gap: 5 }}>
                      <span className="dot" style={{ background: color }} />
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card col small">
              <div className="row spread">
                <span className="muted">Objetivo</span>
                <strong>{GOALS[p.goal].label}</strong>
              </div>
              <div className="row spread">
                <span className="muted">IMC actual</span>
                <strong className="num">{fmt(bmi(weightN, heightN), 1)}</strong>
              </div>
              {weeks !== null && weeks > 0 && (
                <div className="row spread">
                  <span className="muted">Tiempo estimado</span>
                  <strong>
                    {fmt(Math.ceil(weeks))} semanas para llegar a {fmt(p.targetWeightKg, 1)} kg
                  </strong>
                </div>
              )}
            </div>
            <p className="xs muted">
              Las metas son una estimación (fórmula Mifflin-St Jeor) y no reemplazan el consejo de un profesional de la salud. Puedes ajustarlas cuando quieras en
              Perfil.
            </p>
          </div>
        )}

        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="footer-bar">
        <button className="btn" onClick={next}>
          {step === lastStep ? (editing ? 'Guardar cambios' : 'Comenzar') : 'Continuar'}
          {step !== lastStep && <ArrowRight size={20} />}
        </button>
      </div>
    </>
  );
}
