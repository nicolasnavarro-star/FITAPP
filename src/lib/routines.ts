import { candidates, type Pattern } from './exercises';
import type { Equipment, Goal, Level, Plan, PlanDay, PlanExercise } from './types';

type Role = 'C' | 'A'; // compuesto principal o accesorio
type Slot = [Pattern, Role];

interface Template {
  name: string;
  focus: string;
  slots: Slot[];
}

const T: Record<string, Template> = {
  fullA: {
    name: 'Cuerpo completo A',
    focus: 'Sentadilla, empuje y tirón',
    slots: [['squat', 'C'], ['hpush', 'C'], ['hpull', 'C'], ['hinge', 'A'], ['vpush', 'A'], ['core', 'A'], ['biceps', 'A']],
  },
  fullB: {
    name: 'Cuerpo completo B',
    focus: 'Cadena posterior, hombros y espalda',
    slots: [['hinge', 'C'], ['vpush', 'C'], ['vpull', 'C'], ['lunge', 'A'], ['chest_iso', 'A'], ['core', 'A'], ['triceps', 'A']],
  },
  fullC: {
    name: 'Cuerpo completo C',
    focus: 'Piernas, pecho y glúteos',
    slots: [['squat', 'C'], ['hpush', 'C'], ['vpull', 'C'], ['glute', 'A'], ['delt_lat', 'A'], ['core', 'A'], ['biceps', 'A']],
  },
  upperA: {
    name: 'Torso A',
    focus: 'Pecho y espalda',
    slots: [['hpush', 'C'], ['hpull', 'C'], ['vpush', 'C'], ['vpull', 'A'], ['biceps', 'A'], ['triceps', 'A'], ['core', 'A']],
  },
  upperB: {
    name: 'Torso B',
    focus: 'Hombros y dorsales',
    slots: [['vpush', 'C'], ['vpull', 'C'], ['hpush', 'C'], ['hpull', 'A'], ['delt_lat', 'A'], ['triceps', 'A'], ['biceps', 'A']],
  },
  lowerA: {
    name: 'Pierna A',
    focus: 'Cuádriceps',
    slots: [['squat', 'C'], ['hinge', 'C'], ['lunge', 'A'], ['ham_iso', 'A'], ['calf', 'A'], ['core', 'A'], ['quad_iso', 'A']],
  },
  lowerB: {
    name: 'Pierna B',
    focus: 'Glúteos e isquiotibiales',
    slots: [['hinge', 'C'], ['squat', 'C'], ['glute', 'A'], ['quad_iso', 'A'], ['calf', 'A'], ['core', 'A'], ['lunge', 'A']],
  },
  push: {
    name: 'Empuje',
    focus: 'Pecho, hombros y tríceps',
    slots: [['hpush', 'C'], ['vpush', 'C'], ['chest_iso', 'A'], ['delt_lat', 'A'], ['triceps', 'A'], ['core', 'A'], ['triceps', 'A']],
  },
  pull: {
    name: 'Tirón',
    focus: 'Espalda y bíceps',
    slots: [['vpull', 'C'], ['hpull', 'C'], ['delt_rear', 'A'], ['biceps', 'A'], ['hpull', 'A'], ['core', 'A'], ['biceps', 'A']],
  },
  legs: {
    name: 'Pierna',
    focus: 'Tren inferior completo',
    slots: [['squat', 'C'], ['hinge', 'C'], ['lunge', 'A'], ['quad_iso', 'A'], ['ham_iso', 'A'], ['calf', 'A'], ['core', 'A']],
  },
};

const SPLITS: Record<number, string[]> = {
  2: ['fullA', 'fullB'],
  3: ['fullA', 'fullB', 'fullC'],
  4: ['upperA', 'lowerA', 'upperB', 'lowerB'],
  5: ['push', 'pull', 'legs', 'upperA', 'lowerB'],
  6: ['push', 'pull', 'legs', 'push', 'pull', 'legs'],
};

export const SPLIT_NAMES: Record<number, string> = {
  2: 'Cuerpo completo',
  3: 'Cuerpo completo',
  4: 'Torso / Pierna',
  5: 'Empuje / Tirón / Pierna + Torso / Pierna',
  6: 'Empuje / Tirón / Pierna ×2',
};

export const EQUIPMENT_LABELS: Record<Equipment, { label: string; desc: string }> = {
  gym: { label: 'Gimnasio', desc: 'Barras, máquinas, poleas y mancuernas' },
  dumbbells: { label: 'Mancuernas', desc: 'En casa con mancuernas y una silla o banco' },
  bodyweight: { label: 'Peso corporal', desc: 'Sin equipamiento, en cualquier lugar' },
};

export const LEVEL_LABELS: Record<Level, { label: string; desc: string }> = {
  beginner: { label: 'Principiante', desc: 'Menos de 6 meses entrenando' },
  intermediate: { label: 'Intermedio', desc: 'Entre 6 meses y 2 años' },
  advanced: { label: 'Avanzado', desc: 'Más de 2 años de entrenamiento constante' },
};

const EXERCISES_PER_DAY: Record<Level, number> = { beginner: 5, intermediate: 6, advanced: 7 };

function prescription(goal: Goal, level: Level, role: Role, pattern: Pattern, timed: boolean, bodyweight: boolean): Omit<PlanExercise, 'exerciseId'> {
  if (pattern === 'core') {
    return { sets: 3, reps: timed ? '30-45 s' : '12-15', restSec: 45 };
  }
  const compound = role === 'C';
  let sets = compound ? (level === 'beginner' ? 3 : 4) : 3;
  if (goal === 'lose' && compound && level !== 'advanced') sets = 3;
  let reps: string;
  let restSec: number;
  if (goal === 'gain') {
    reps = compound ? '6-10' : '10-15';
    restSec = compound ? 120 : 75;
  } else if (goal === 'lose') {
    reps = compound ? '8-12' : '12-15';
    restSec = compound ? 90 : 60;
  } else {
    reps = compound ? '6-10' : '10-12';
    restSec = compound ? 120 : 75;
  }
  if (timed) reps = '30-45 s';
  else if (bodyweight) reps = compound ? '8-15' : '12-20';
  return { sets, reps, restSec };
}

const FINISHERS: Record<Goal, string | undefined> = {
  lose: 'Cardio final: 15–20 min de caminata inclinada, bicicleta o elíptica a ritmo moderado.',
  maintain: 'Opcional: 10 min de cardio suave para cerrar la sesión.',
  gain: undefined,
};

export interface PlanOptions {
  goal: Goal;
  daysPerWeek: number;
  equipment: Equipment;
  level: Level;
}

/** Genera una rutina semanal según objetivo, días disponibles, equipamiento y nivel. */
export function generatePlan(opts: PlanOptions, now = Date.now()): Plan {
  const days = Math.min(6, Math.max(2, Math.round(opts.daysPerWeek)));
  const split = SPLITS[days];
  const used: Partial<Record<Pattern, number>> = {};
  const repeated = new Map<string, number>();

  const planDays: PlanDay[] = split.map((key) => {
    const tpl = T[key];
    const count = (repeated.get(key) ?? 0) + 1;
    repeated.set(key, count);
    const total = split.filter((k) => k === key).length;
    const inDay = new Set<string>();
    const exercises: PlanExercise[] = [];
    for (const [pattern, role] of tpl.slots.slice(0, EXERCISES_PER_DAY[opts.level])) {
      const options = candidates(pattern, opts.equipment);
      if (options.length === 0) continue;
      // Rota entre opciones del mismo patrón durante la semana para dar variedad.
      const start = used[pattern] ?? 0;
      let pick = options[start % options.length];
      for (let i = 0; i < options.length && inDay.has(pick.id); i++) pick = options[(start + i + 1) % options.length];
      if (inDay.has(pick.id)) continue;
      used[pattern] = start + 1;
      inDay.add(pick.id);
      exercises.push({ exerciseId: pick.id, ...prescription(opts.goal, opts.level, role, pattern, !!pick.timed, pick.eq === 'bw') });
    }
    return {
      name: total > 1 ? `${tpl.name} ${count === 1 ? 'A' : 'B'}` : tpl.name,
      focus: tpl.focus,
      exercises,
      finisher: FINISHERS[opts.goal],
    };
  });

  return { createdAt: now, goal: opts.goal, daysPerWeek: days, equipment: opts.equipment, level: opts.level, days: planDays };
}
