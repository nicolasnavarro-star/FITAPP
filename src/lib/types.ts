export type Sex = 'male' | 'female';
export type Goal = 'lose' | 'maintain' | 'gain';
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type MealId = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface Profile {
  name: string;
  sex: Sex;
  age: number;
  heightCm: number;
  /** Peso al crear el perfil; el peso actual sale del registro de pesos. */
  startWeightKg: number;
  activity: Activity;
  goal: Goal;
  targetWeightKg: number;
  /** kg por semana (0 si el objetivo es mantener). */
  weeklyRateKg: number;
}

export interface Targets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Valores nutricionales por 100 g (o 100 ml). */
export interface Food {
  id: string;
  name: string;
  brand?: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  unit: 'g' | 'ml';
  /** Detalle opcional por 100 g/ml (viene de la etiqueta del producto). */
  fiber?: number;
  sugars?: number;
  satFat?: number;
  /** Sodio en miligramos por 100 g/ml. */
  sodium?: number;
  /** URL de la foto del producto. */
  image?: string;
  portion?: { label: string; grams: number };
  barcode?: string;
  source: 'base' | 'off' | 'custom' | 'ai' | 'quick';
}

export interface Entry {
  id: string;
  date: string;
  meal: MealId;
  food: Food;
  grams: number;
  createdAt: number;
}

export interface WeightLog {
  date: string;
  kg: number;
}

export type Equipment = 'gym' | 'dumbbells' | 'bodyweight';
export type Level = 'beginner' | 'intermediate' | 'advanced';

export interface PlanExercise {
  exerciseId: string;
  sets: number;
  reps: string;
  restSec: number;
}

export interface PlanDay {
  name: string;
  focus: string;
  exercises: PlanExercise[];
  finisher?: string;
}

export interface Plan {
  createdAt: number;
  goal: Goal;
  daysPerWeek: number;
  equipment: Equipment;
  level: Level;
  days: PlanDay[];
}

export interface SetLog {
  kg: number | null;
  reps: number | null;
  done: boolean;
}

export interface WorkoutItem {
  exerciseId: string;
  target: { sets: number; reps: string; restSec: number };
  sets: SetLog[];
}

export interface ActiveWorkout {
  dayIndex: number;
  dayName: string;
  startedAt: number;
  items: WorkoutItem[];
}

export interface WorkoutLog {
  id: string;
  date: string;
  dayName: string;
  durationMin: number;
  items: WorkoutItem[];
}

/** Resumen de una actividad al aire libre; el recorrido completo se guarda aparte. */
export interface OutdoorActivity {
  id: string;
  sport: import('./geo').Sport;
  name: string;
  startedAt: number;
  endedAt: number;
  distanceM: number;
  movingSec: number;
  elapsedSec: number;
  ascentM: number;
  descentM: number;
  maxEle: number | null;
  minEle: number | null;
  kcal: number;
  /** De dónde salen las altitudes: del GPS del teléfono o del modelo de terreno. */
  eleSource: 'gps' | 'terrain';
  /** Recorrido reducido para dibujar la miniatura. */
  preview: import('./geo').LatLon[];
  routeId?: string;
}

/** Zona de mapa descargada para usar sin conexión. */
export interface OfflineRegion {
  id: string;
  name: string;
  bounds: import('./terrain').Bounds;
  createdAt: number;
  /** Teselas de relieve guardadas y su tamaño en bytes. */
  tiles: number;
  bytes: number;
  /** Senderos y caminos guardados. */
  ways: number;
}

export interface PlannedRoute {
  id: string;
  name: string;
  createdAt: number;
  distanceM: number;
  ascentM: number;
  descentM: number;
  preview: import('./geo').LatLon[];
}

export type AiProvider = 'gemini' | 'claude';

/** Ejercicio sugerido por la IA para un equipo fotografiado. */
export interface EquipmentExercise {
  name: string;
  muscles: string;
  setsReps: string;
  steps: string[];
  tip: string;
}

export interface SavedEquipment {
  id: string;
  name: string;
  summary: string;
  /** Grupo muscular consultado; vacío si fue una consulta general. */
  muscle: string;
  /** Miniatura de la foto (data URL pequeña), si hubo foto. */
  thumb?: string;
  exercises: EquipmentExercise[];
  createdAt: number;
}

export interface AiSettings {
  provider: AiProvider;
  geminiKey: string;
  geminiModel: string;
  /** Último modelo de imágenes de Gemini que funcionó con esta clave. */
  geminiImageModel?: string;
  claudeKey: string;
  claudeModel: string;
}
