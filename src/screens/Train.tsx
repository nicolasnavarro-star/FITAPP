import { ArrowLeftRight, CalendarCheck, Camera, ChevronRight, Dumbbell, Images, Play, PlayCircle, Settings2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Sheet } from '../components/ui';
import { alternatives, getExercise, imagesUrl, videoUrl } from '../lib/exercises';
import { EQUIPMENT_LABELS, LEVEL_LABELS, SPLIT_NAMES } from '../lib/routines';
import type { WorkoutLog } from '../lib/types';
import { addDays, daysBetween, fmt, formatDate, parseDateKey, todayKey } from '../lib/util';
import { push } from '../router';
import { useStore } from '../store';

function volume(w: WorkoutLog): number {
  return w.items.reduce((a, it) => a + it.sets.reduce((b, s) => b + (s.kg ?? 0) * (s.reps ?? 0), 0), 0);
}

function EquipmentCard() {
  return (
    <button className="card row" style={{ textAlign: 'left', width: '100%' }} onClick={() => push('/equipment')}>
      <span className="badge">
        <Camera size={20} />
      </span>
      <div className="grow">
        <h2 className="card-title">¿Qué puedo hacer con este equipo?</h2>
        <p className="small muted">Saca una foto a una máquina o implemento y mira ejercicios por grupo muscular</p>
      </div>
      <ChevronRight size={20} color="var(--text-3)" />
    </button>
  );
}

function ReferenceLinks({ name }: { name: string }) {
  return (
    <div className="row">
      <a className="btn sm grow" href={videoUrl(name)} target="_blank" rel="noreferrer">
        <PlayCircle size={18} /> Ver video
      </a>
      <a className="btn sm secondary grow" href={imagesUrl(name)} target="_blank" rel="noreferrer">
        <Images size={18} /> Imágenes
      </a>
    </div>
  );
}

function setCount(w: WorkoutLog): number {
  return w.items.reduce((a, it) => a + it.sets.length, 0);
}

export default function Train() {
  const plan = useStore((s) => s.plan);
  const workouts = useStore((s) => s.workouts);
  const active = useStore((s) => s.activeWorkout);
  const startWorkout = useStore((s) => s.startWorkout);
  const swapPlanExercise = useStore((s) => s.swapPlanExercise);
  const removeWorkout = useStore((s) => s.removeWorkout);
  const [detail, setDetail] = useState<{ day: number; ex: number } | null>(null);

  if (!plan) {
    return (
      <div className="screen with-tabs">
        <h1 className="title-xl">Entrenamiento</h1>
        <div className="card col center" style={{ alignItems: 'center', padding: 28 }}>
          <span className="badge" style={{ width: 60, height: 60, borderRadius: 18 }}>
            <Dumbbell size={30} />
          </span>
          <h2 className="card-title">Crea tu rutina</h2>
          <p className="small muted">Dinos cuántos días puedes entrenar, con qué equipamiento cuentas y tu nivel. Armaremos una rutina semanal para todo el cuerpo acorde a tu objetivo.</p>
          <button className="btn" onClick={() => push('/plan-setup')}>
            Crear mi rutina
          </button>
        </div>
        <EquipmentCard />
      </div>
    );
  }

  const today = todayKey();
  // Semana de lunes a domingo.
  const weekStart = addDays(today, -((parseDateKey(today).getDay() + 6) % 7));
  const thisWeek = workouts.filter((w) => w.date >= weekStart).length;
  const last = workouts[0];
  const lastIdx = last ? plan.days.findIndex((d) => d.name === last.dayName) : -1;
  const nextIdx = (lastIdx + 1) % plan.days.length;

  const begin = (i: number) => {
    if (!active) startWorkout(i);
    push('/workout');
  };

  const sel = detail ? plan.days[detail.day].exercises[detail.ex] : null;
  const selEx = sel ? getExercise(sel.exerciseId) : null;

  return (
    <div className="screen with-tabs">
      <div className="row spread">
        <h1 className="title-xl">Entrenamiento</h1>
        <button className="icon-btn filled" aria-label="Cambiar rutina" onClick={() => push('/plan-setup')}>
          <Settings2 size={20} />
        </button>
      </div>

      <div className="hero col" style={{ gap: 12 }}>
        <div className="row spread">
          <span className="label">{active ? 'En curso' : 'Siguiente sesión'}</span>
          <span className="label num row" style={{ gap: 6 }}>
            <CalendarCheck size={15} /> {thisWeek} de {plan.daysPerWeek} esta semana
          </span>
        </div>
        <div>
          <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>{active ? active.dayName : plan.days[nextIdx].name}</h2>
          <p className="small" style={{ color: 'rgba(255,255,255,0.78)' }}>
            {(active ? active.items : plan.days[nextIdx].exercises).length} ejercicios · {SPLIT_NAMES[plan.daysPerWeek]} · {EQUIPMENT_LABELS[plan.equipment].label} · {LEVEL_LABELS[plan.level].label}
          </p>
        </div>
        <div className="progress-track" role="progressbar" aria-label="Sesiones de la semana" aria-valuenow={thisWeek} aria-valuemax={plan.daysPerWeek}>
          <div style={{ width: `${Math.min(100, (thisWeek / plan.daysPerWeek) * 100)}%` }} />
        </div>
        <button className="btn" onClick={() => begin(nextIdx)}>
          <Play size={18} /> {active ? 'Continuar entrenamiento' : 'Empezar ahora'}
        </button>
      </div>

      <EquipmentCard />

      {plan.days.map((day, di) => (
        <div className="card col" key={di}>
          <div className="row spread">
            <div className="grow">
              <h2 className="card-title">
                Día {di + 1} · {day.name}
              </h2>
              <p className="small muted">{day.focus}</p>
            </div>
            {di === nextIdx && !active && <span className="chip active" style={{ minHeight: 28, fontSize: 12 }}>Siguiente</span>}
          </div>
          <div className="list">
            {day.exercises.map((pe, ei) => {
              const ex = getExercise(pe.exerciseId);
              return (
                <button className="list-item" key={ei} onClick={() => setDetail({ day: di, ex: ei })}>
                  <div className="grow">
                    <div className="name">{ex.name}</div>
                    <div className="sub">{ex.muscle}</div>
                  </div>
                  <span className="kcal num">
                    {pe.sets} × {pe.reps}
                  </span>
                </button>
              );
            })}
          </div>
          {day.finisher && <p className="xs muted">{day.finisher}</p>}
          {!active && (
            <button className="btn secondary" onClick={() => begin(di)}>
              <Play size={18} /> Empezar
            </button>
          )}
        </div>
      ))}

      <div className="card">
        <h2 className="card-title">Historial</h2>
        {workouts.length > 0 ? (
          <div className="list">
            {workouts.slice(0, 15).map((w) => (
              <div className="list-item" key={w.id}>
                <div className="grow">
                  <div className="name">{w.dayName}</div>
                  <div className="sub num">
                    {daysBetween(w.date, today) === 0 ? 'Hoy' : formatDate(w.date, true)} · {w.durationMin} min · {setCount(w)} {setCount(w) === 1 ? 'serie' : 'series'}
                    {volume(w) > 0 ? ` · ${fmt(volume(w))} kg` : ''}
                  </div>
                </div>
                <button className="icon-btn" aria-label={`Eliminar entrenamiento del ${formatDate(w.date)}`} onClick={() => removeWorkout(w.id)}>
                  <Trash2 size={18} color="var(--text-3)" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty">Cuando termines tu primer entrenamiento aparecerá aquí.</p>
        )}
      </div>

      {detail && sel && selEx && (
        <Sheet title={selEx.name} onClose={() => setDetail(null)}>
          <p className="small muted">
            {selEx.muscle} · {sel.sets} series de {sel.reps} · descanso {sel.restSec} s
          </p>
          <div className="card small">{selEx.tips}</div>
          <ReferenceLinks name={selEx.name} />
          <h3 className="card-title row">
            <ArrowLeftRight size={16} /> Cambiar por otro ejercicio
          </h3>
          <div className="col">
            {alternatives(sel.exerciseId, plan.equipment).map((alt) => (
              <button
                key={alt.id}
                className="option"
                onClick={() => {
                  swapPlanExercise(detail.day, detail.ex, alt.id);
                  setDetail(null);
                }}
              >
                <div className="grow">
                  <strong>{alt.name}</strong>
                  <span>{alt.muscle}</span>
                </div>
              </button>
            ))}
            {alternatives(sel.exerciseId, plan.equipment).length === 0 && <p className="small muted">No hay alternativas con tu equipamiento.</p>}
          </div>
        </Sheet>
      )}
    </div>
  );
}
