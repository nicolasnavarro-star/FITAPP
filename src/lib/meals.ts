import type { MealId } from './types';

export const MEALS: { id: MealId; label: string }[] = [
  { id: 'breakfast', label: 'Desayuno' },
  { id: 'lunch', label: 'Almuerzo' },
  { id: 'dinner', label: 'Cena' },
  { id: 'snack', label: 'Colaciones' },
];

export function mealLabel(id: MealId): string {
  return MEALS.find((m) => m.id === id)?.label ?? 'Comida';
}

export function isMealId(v: string | null): v is MealId {
  return MEALS.some((m) => m.id === v);
}

/** Comida más probable según la hora del día. */
export function defaultMeal(now = new Date()): MealId {
  const h = now.getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 19) return 'snack';
  return 'dinner';
}
