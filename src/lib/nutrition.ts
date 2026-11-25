import type { Activity, Entry, Food, Goal, Profile, Targets } from './types';

export const ACTIVITY: Record<Activity, { factor: number; label: string; desc: string }> = {
  sedentary: { factor: 1.2, label: 'Sedentario', desc: 'Trabajo sentado, casi sin ejercicio' },
  light: { factor: 1.375, label: 'Ligero', desc: 'Ejercicio 1–3 días por semana' },
  moderate: { factor: 1.55, label: 'Moderado', desc: 'Ejercicio 3–5 días por semana' },
  active: { factor: 1.725, label: 'Alto', desc: 'Ejercicio intenso 6–7 días por semana' },
  very_active: { factor: 1.9, label: 'Muy alto', desc: 'Trabajo físico más entrenamiento diario' },
};

export const GOALS: Record<Goal, { label: string; desc: string }> = {
  lose: { label: 'Definición', desc: 'Perder grasa manteniendo músculo' },
  maintain: { label: 'Mantener', desc: 'Conservar el peso y mejorar la composición' },
  gain: { label: 'Ganar músculo', desc: 'Subir de peso con un superávit controlado' },
};

const KCAL_PER_KG = 7700;

/** Tasa metabólica basal (Mifflin-St Jeor). */
export function bmr(sex: Profile['sex'], weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

export function tdee(p: Profile, weightKg: number): number {
  return bmr(p.sex, weightKg, p.heightCm, p.age) * ACTIVITY[p.activity].factor;
}

export function bmi(weightKg: number, heightCm: number): number {
  const h = heightCm / 100;
  return weightKg / (h * h);
}

export function bmiLabel(v: number): string {
  if (v < 18.5) return 'Bajo peso';
  if (v < 25) return 'Peso saludable';
  if (v < 30) return 'Sobrepeso';
  return 'Obesidad';
}

/**
 * Calcula calorías y macros diarios.
 * - Definición: déficit según el ritmo semanal, con tope del 25 % del gasto y un mínimo seguro.
 * - Volumen: superávit según el ritmo semanal, con tope del 15 % del gasto.
 */
export function computeTargets(p: Profile, weightKg: number): Targets {
  const maintenance = tdee(p, weightKg);
  const daily = (p.weeklyRateKg * KCAL_PER_KG) / 7;
  let kcal = maintenance;
  if (p.goal === 'lose') {
    kcal = maintenance - Math.min(daily, maintenance * 0.25);
    kcal = Math.max(kcal, p.sex === 'male' ? 1500 : 1200);
  } else if (p.goal === 'gain') {
    kcal = maintenance + Math.min(daily, maintenance * 0.15);
  }
  kcal = Math.round(kcal / 10) * 10;

  // Con mucho sobrepeso, la proteína se calcula sobre un peso de referencia (IMC 27).
  const h = p.heightCm / 100;
  const refWeight = Math.min(weightKg, 27 * h * h);
  const proteinPerKg = p.goal === 'lose' ? 2.0 : p.goal === 'gain' ? 1.8 : 1.6;
  const protein = Math.round(refWeight * proteinPerKg);
  const fat = Math.round(Math.max((kcal * 0.25) / 9, refWeight * 0.6));
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carbs, fat };
}

/** Semanas estimadas para llegar al peso objetivo, o null si no aplica. */
export function weeksToGoal(p: Profile, weightKg: number): number | null {
  if (p.goal === 'maintain' || p.weeklyRateKg <= 0) return null;
  const diff = p.goal === 'lose' ? weightKg - p.targetWeightKg : p.targetWeightKg - weightKg;
  if (diff <= 0) return 0;
  return diff / p.weeklyRateKg;
}

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export function macrosFor(food: Food, grams: number): Macros {
  const f = grams / 100;
  return { kcal: food.kcal * f, protein: food.protein * f, carbs: food.carbs * f, fat: food.fat * f };
}

export function sumEntries(entries: Entry[]): Macros {
  const t: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const e of entries) {
    const m = macrosFor(e.food, e.grams);
    t.kcal += m.kcal;
    t.protein += m.protein;
    t.carbs += m.carbs;
    t.fat += m.fat;
  }
  return t;
}
