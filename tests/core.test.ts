import { describe, expect, it } from 'vitest';
import { aiItemToFood } from '../src/lib/ai';
import { EXERCISES, candidates, getExercise, imagesUrl, videoUrl } from '../src/lib/exercises';
import { BASE_FOODS, searchFoods } from '../src/lib/foods';
import { bmr, computeTargets, macrosFor, weeksToGoal } from '../src/lib/nutrition';
import { mapOffProduct } from '../src/lib/off';
import { generatePlan } from '../src/lib/routines';
import type { Equipment, Goal, Level, Profile } from '../src/lib/types';
import { addDays, daysBetween, parseNum } from '../src/lib/util';

const base: Profile = {
  name: 'Test',
  sex: 'male',
  age: 30,
  heightCm: 180,
  startWeightKg: 80,
  activity: 'moderate',
  goal: 'lose',
  targetWeightKg: 75,
  weeklyRateKg: 0.5,
};

describe('nutrición', () => {
  it('calcula la tasa metabólica basal con Mifflin-St Jeor', () => {
    expect(bmr('male', 80, 180, 30)).toBeCloseTo(1780, 0);
    expect(bmr('female', 60, 165, 30)).toBeCloseTo(1320.25, 1);
  });

  it('aplica déficit en definición y superávit en volumen', () => {
    const maintain = computeTargets({ ...base, goal: 'maintain', weeklyRateKg: 0 }, 80);
    const lose = computeTargets(base, 80);
    const gain = computeTargets({ ...base, goal: 'gain', targetWeightKg: 85, weeklyRateKg: 0.25 }, 80);
    expect(maintain.kcal).toBe(2760);
    expect(lose.kcal).toBe(2210); // 2759 − 550
    expect(gain.kcal).toBe(3030); // 2759 + 275
  });

  it('los macros suman aproximadamente las calorías objetivo', () => {
    for (const goal of ['lose', 'maintain', 'gain'] as Goal[]) {
      const t = computeTargets({ ...base, goal }, 80);
      expect(Math.abs(t.protein * 4 + t.carbs * 4 + t.fat * 9 - t.kcal)).toBeLessThan(15);
    }
  });

  it('nunca baja del mínimo seguro de calorías', () => {
    const small: Profile = { ...base, sex: 'female', age: 60, heightCm: 150, activity: 'sedentary', weeklyRateKg: 1 };
    expect(computeTargets(small, 50).kcal).toBeGreaterThanOrEqual(1200);
    expect(computeTargets({ ...small, sex: 'male' }, 50).kcal).toBeGreaterThanOrEqual(1500);
  });

  it('estima las semanas para llegar al objetivo', () => {
    expect(weeksToGoal(base, 80)).toBe(10);
    expect(weeksToGoal(base, 74)).toBe(0);
    expect(weeksToGoal({ ...base, goal: 'maintain' }, 80)).toBeNull();
  });

  it('escala macros por gramos', () => {
    const rice = BASE_FOODS.find((f) => f.name === 'Arroz blanco cocido')!;
    expect(macrosFor(rice, 200).kcal).toBe(260);
  });
});

describe('alimentos', () => {
  it('todos los alimentos base tienen valores coherentes', () => {
    for (const f of BASE_FOODS) {
      expect(f.kcal, f.name).toBeGreaterThanOrEqual(0);
      expect(f.kcal, f.name).toBeLessThanOrEqual(900);
      expect(f.protein + f.carbs + f.fat, f.name).toBeLessThanOrEqual(101);
      // Las calorías declaradas deben parecerse a las que dan los macros (el alcohol es la excepción).
      const fromMacros = f.protein * 4 + f.carbs * 4 + f.fat * 9;
      if (!/cerveza|vino|pisco/i.test(f.name)) expect(Math.abs(fromMacros - f.kcal), f.name).toBeLessThan(Math.max(25, f.kcal * 0.2));
    }
  });

  it('busca sin importar tildes ni mayúsculas', () => {
    expect(searchFoods('platano')[0].name).toBe('Plátano');
    expect(searchFoods('POLLO pechuga')[0].name).toBe('Pechuga de pollo cocida');
    expect(searchFoods('zzzz')).toHaveLength(0);
  });

  it('convierte productos de Open Food Facts', () => {
    const food = mapOffProduct({
      code: '123',
      product_name: 'Yogur natural',
      brands: 'Marca, Otra',
      nutriments: { 'energy-kcal_100g': 61.4, proteins_100g: '3.5', carbohydrates_100g: 4.7, fat_100g: 3.3 },
      serving_quantity: 125,
      serving_size: '125 g',
    })!;
    expect(food).toMatchObject({ name: 'Yogur natural', brand: 'Marca', kcal: 61, protein: 3.5, unit: 'g', barcode: '123' });
    expect(food.portion?.grams).toBe(125);
    expect(mapOffProduct({ product_name: 'Sin datos', nutriments: {} })).toBeNull();
    expect(mapOffProduct({ product_name: 'En kJ', nutriments: { energy_100g: 418.4 } })?.kcal).toBe(100);
    expect(mapOffProduct({ product_name: 'Jugo', quantity: '1 L', nutriments: { 'energy-kcal_100g': 45 } })?.unit).toBe('ml');
  });

  it('convierte una estimación de IA a valores por 100 g', () => {
    const food = aiItemToFood({ name: 'Arroz', grams: 200, kcal: 260, protein: 5.4, carbs: 56, fat: 0.6 });
    expect(food).toMatchObject({ kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, source: 'ai' });
  });
});

describe('rutinas', () => {
  const goals: Goal[] = ['lose', 'maintain', 'gain'];
  const equipments: Equipment[] = ['gym', 'dumbbells', 'bodyweight'];
  const levels: Level[] = ['beginner', 'intermediate', 'advanced'];

  it('genera planes válidos para todas las combinaciones', () => {
    for (const goal of goals)
      for (const equipment of equipments)
        for (const level of levels)
          for (let days = 2; days <= 6; days++) {
            const plan = generatePlan({ goal, daysPerWeek: days, equipment, level });
            expect(plan.days).toHaveLength(days);
            expect(new Set(plan.days.map((d) => d.name)).size).toBe(days);
            for (const day of plan.days) {
              const ids = day.exercises.map((e) => e.exerciseId);
              expect(ids.length).toBeGreaterThanOrEqual(5);
              expect(new Set(ids).size).toBe(ids.length);
              for (const pe of day.exercises) {
                const ex = getExercise(pe.exerciseId);
                expect(EXERCISES).toContain(ex);
                if (equipment === 'bodyweight') expect(ex.eq).toBe('bw');
                if (equipment === 'dumbbells') expect(ex.eq).not.toBe('gym');
                expect(pe.sets).toBeGreaterThanOrEqual(3);
              }
            }
          }
  });

  it('hay ejercicios para cada patrón con cualquier equipamiento', () => {
    const patterns = new Set(EXERCISES.map((e) => e.pattern));
    for (const p of patterns) for (const eq of equipments) expect(candidates(p, eq).length, `${p}/${eq}`).toBeGreaterThan(0);
  });

  it('arma enlaces de referencia con el nombre del ejercicio codificado', () => {
    const video = new URL(videoUrl('Jalón al pecho & más'));
    expect(video.hostname).toBe('www.youtube.com');
    expect(video.searchParams.get('search_query')).toBe('cómo hacer Jalón al pecho & más técnica correcta');
    expect(new URL(imagesUrl('Curl martillo')).searchParams.get('q')).toContain('Curl martillo');
  });

  it('los ids de ejercicios son únicos', () => {
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
  });
});

describe('utilidades', () => {
  it('interpreta números con coma o punto', () => {
    expect(parseNum('72,5')).toBe(72.5);
    expect(parseNum('72.5')).toBe(72.5);
    expect(parseNum('')).toBeNull();
    expect(parseNum('abc')).toBeNull();
  });

  it('opera con fechas locales', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
  });
});
