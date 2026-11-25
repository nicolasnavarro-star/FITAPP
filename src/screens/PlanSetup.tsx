import { useState } from 'react';
import { Header, OptionCard, Segmented } from '../components/ui';
import { GOALS } from '../lib/nutrition';
import { EQUIPMENT_LABELS, LEVEL_LABELS, SPLIT_NAMES, generatePlan } from '../lib/routines';
import type { Equipment, Goal, Level } from '../lib/types';
import { back } from '../router';
import { useStore, useUi } from '../store';

export default function PlanSetup() {
  const profile = useStore((s) => s.profile);
  const plan = useStore((s) => s.plan);
  const setPlan = useStore((s) => s.setPlan);
  const hasActive = useStore((s) => s.activeWorkout !== null);
  const showToast = useUi((s) => s.showToast);
  const [goal, setGoal] = useState<Goal>(plan?.goal ?? profile?.goal ?? 'maintain');
  const [days, setDays] = useState(plan?.daysPerWeek ?? 3);
  const [equipment, setEquipment] = useState<Equipment>(plan?.equipment ?? 'gym');
  const [level, setLevel] = useState<Level>(plan?.level ?? 'beginner');

  return (
    <>
      <div className="screen with-footer">
        <Header title={plan ? 'Cambiar rutina' : 'Crear rutina'} />

        <div className="field">
          <span>Objetivo</span>
          <Segmented value={goal} onChange={setGoal} options={(Object.keys(GOALS) as Goal[]).map((g) => ({ value: g, label: GOALS[g].label }))} />
        </div>

        <div className="field">
          <span>Días por semana</span>
          <Segmented value={days} onChange={setDays} options={[2, 3, 4, 5, 6].map((d) => ({ value: d, label: String(d) }))} />
          <p className="xs muted">Distribución: {SPLIT_NAMES[days]}</p>
        </div>

        <div className="field">
          <span>Equipamiento</span>
          <div className="col">
            {(Object.keys(EQUIPMENT_LABELS) as Equipment[]).map((e) => (
              <OptionCard key={e} active={equipment === e} title={EQUIPMENT_LABELS[e].label} desc={EQUIPMENT_LABELS[e].desc} onClick={() => setEquipment(e)} />
            ))}
          </div>
        </div>

        <div className="field">
          <span>Nivel</span>
          <div className="col">
            {(Object.keys(LEVEL_LABELS) as Level[]).map((l) => (
              <OptionCard key={l} active={level === l} title={LEVEL_LABELS[l].label} desc={LEVEL_LABELS[l].desc} onClick={() => setLevel(l)} />
            ))}
          </div>
        </div>
        {hasActive && <div className="notice small">Tienes un entrenamiento en curso: termínalo o descártalo antes de cambiar la rutina.</div>}
      </div>
      <div className="footer-bar">
        <button
          className="btn"
          disabled={hasActive}
          onClick={() => {
            setPlan(generatePlan({ goal, daysPerWeek: days, equipment, level }));
            showToast('Rutina creada');
            back();
          }}
        >
          Generar rutina
        </button>
      </div>
    </>
  );
}
