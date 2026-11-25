import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_CLAUDE_MODEL, DEFAULT_GEMINI_MODEL } from './lib/ai';
import { computeTargets } from './lib/nutrition';
import type { ActiveWorkout, AiSettings, OutdoorActivity, PlannedRoute, Entry, Food, MealId, Plan, Profile, SavedEquipment, SetLog, Targets, WeightLog, WorkoutLog } from './lib/types';
import { todayKey, uid } from './lib/util';

export type ThemePref = 'system' | 'light' | 'dark';

interface Data {
  profile: Profile | null;
  /** Metas definidas a mano; si es null se calculan con el perfil. */
  targetsOverride: Targets | null;
  entries: Entry[];
  customFoods: Food[];
  recents: { food: Food; grams: number }[];
  /** Agua por día, en ml. */
  water: Record<string, number>;
  weights: WeightLog[];
  plan: Plan | null;
  workouts: WorkoutLog[];
  activeWorkout: ActiveWorkout | null;
  /** Equipos identificados con foto y sus ejercicios sugeridos. */
  equipment: SavedEquipment[];
  /** Actividades de montaña y rutas trazadas (sus recorridos completos viven en IndexedDB). */
  activities: OutdoorActivity[];
  routes: PlannedRoute[];
  /** Última ubicación conocida, para mostrar el clima sin esperar al GPS. */
  lastLoc: { lat: number; lon: number } | null;
  ai: AiSettings;
  theme: ThemePref;
}

interface Actions {
  setProfile: (p: Profile) => void;
  setTargetsOverride: (t: Targets | null) => void;
  addEntry: (e: { date: string; meal: MealId; food: Food; grams: number }) => void;
  updateEntry: (id: string, patch: Partial<Pick<Entry, 'grams' | 'meal'>>) => void;
  removeEntry: (id: string) => void;
  saveCustomFood: (f: Food) => void;
  removeCustomFood: (id: string) => void;
  addWater: (date: string, ml: number) => void;
  logWeight: (date: string, kg: number) => void;
  removeWeight: (date: string) => void;
  setPlan: (p: Plan | null) => void;
  swapPlanExercise: (dayIndex: number, exIndex: number, exerciseId: string) => void;
  startWorkout: (dayIndex: number) => void;
  updateSet: (itemIndex: number, setIndex: number, patch: Partial<SetLog>) => void;
  addSet: (itemIndex: number) => void;
  removeSet: (itemIndex: number) => void;
  finishWorkout: () => WorkoutLog | null;
  cancelWorkout: () => void;
  removeWorkout: (id: string) => void;
  saveEquipment: (e: SavedEquipment) => void;
  removeEquipment: (id: string) => void;
  addActivity: (a: OutdoorActivity) => void;
  updateActivity: (id: string, patch: Partial<OutdoorActivity>) => void;
  removeActivity: (id: string) => void;
  saveRoute: (r: PlannedRoute) => void;
  removeRoute: (id: string) => void;
  setLastLoc: (lat: number, lon: number) => void;
  setAi: (patch: Partial<AiSettings>) => void;
  setTheme: (t: ThemePref) => void;
  importData: (raw: unknown) => void;
  resetAll: () => void;
}

const initial: Data = {
  profile: null,
  targetsOverride: null,
  entries: [],
  customFoods: [],
  recents: [],
  water: {},
  weights: [],
  plan: null,
  workouts: [],
  activeWorkout: null,
  equipment: [],
  activities: [],
  routes: [],
  lastLoc: null,
  ai: { provider: 'gemini', geminiKey: '', geminiModel: DEFAULT_GEMINI_MODEL, claudeKey: '', claudeModel: DEFAULT_CLAUDE_MODEL },
  theme: 'dark',
};

const DATA_KEYS = Object.keys(initial) as (keyof Data)[];

export const useStore = create<Data & Actions>()(
  persist(
    (set, get) => ({
      ...initial,

      setProfile: (profile) => set({ profile }),
      setTargetsOverride: (targetsOverride) => set({ targetsOverride }),

      addEntry: ({ date, meal, food, grams }) =>
        set((s) => {
          const entry: Entry = { id: uid(), date, meal, food, grams, createdAt: Date.now() };
          const recents =
            food.source === 'quick'
              ? s.recents
              : [{ food, grams }, ...s.recents.filter((r) => r.food.id !== food.id && r.food.name !== food.name)].slice(0, 30);
          return { entries: [...s.entries, entry], recents };
        }),
      updateEntry: (id, patch) => set((s) => ({ entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
      removeEntry: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),

      saveCustomFood: (f) => set((s) => ({ customFoods: [f, ...s.customFoods.filter((c) => c.id !== f.id)] })),
      removeCustomFood: (id) => set((s) => ({ customFoods: s.customFoods.filter((c) => c.id !== id) })),

      addWater: (date, ml) => set((s) => ({ water: { ...s.water, [date]: Math.max(0, (s.water[date] ?? 0) + ml) } })),

      logWeight: (date, kg) =>
        set((s) => ({ weights: [...s.weights.filter((w) => w.date !== date), { date, kg }].sort((a, b) => a.date.localeCompare(b.date)) })),
      removeWeight: (date) => set((s) => ({ weights: s.weights.filter((w) => w.date !== date) })),

      setPlan: (plan) => set({ plan }),
      swapPlanExercise: (dayIndex, exIndex, exerciseId) =>
        set((s) => {
          if (!s.plan) return {};
          const days = s.plan.days.map((d, di) =>
            di !== dayIndex ? d : { ...d, exercises: d.exercises.map((e, ei) => (ei === exIndex ? { ...e, exerciseId } : e)) },
          );
          return { plan: { ...s.plan, days } };
        }),

      startWorkout: (dayIndex) => {
        const { plan, workouts } = get();
        const day = plan?.days[dayIndex];
        if (!day) return;
        const items = day.exercises.map((pe) => {
          // Precarga los pesos de la última vez que se hizo el ejercicio.
          const last = lastSetsFor(workouts, pe.exerciseId);
          const sets: SetLog[] = Array.from({ length: pe.sets }, (_, i) => {
            const prev = last?.[Math.min(i, last.length - 1)];
            return { kg: prev?.kg ?? null, reps: prev?.reps ?? null, done: false };
          });
          return { exerciseId: pe.exerciseId, target: { sets: pe.sets, reps: pe.reps, restSec: pe.restSec }, sets };
        });
        set({ activeWorkout: { dayIndex, dayName: day.name, startedAt: Date.now(), items } });
      },
      updateSet: (itemIndex, setIndex, patch) =>
        set((s) => {
          if (!s.activeWorkout) return {};
          const items = s.activeWorkout.items.map((it, i) =>
            i !== itemIndex ? it : { ...it, sets: it.sets.map((st, j) => (j === setIndex ? { ...st, ...patch } : st)) },
          );
          return { activeWorkout: { ...s.activeWorkout, items } };
        }),
      addSet: (itemIndex) =>
        set((s) => {
          if (!s.activeWorkout) return {};
          const items = s.activeWorkout.items.map((it, i) => {
            if (i !== itemIndex) return it;
            const last = it.sets[it.sets.length - 1];
            return { ...it, sets: [...it.sets, { kg: last?.kg ?? null, reps: last?.reps ?? null, done: false }] };
          });
          return { activeWorkout: { ...s.activeWorkout, items } };
        }),
      removeSet: (itemIndex) =>
        set((s) => {
          if (!s.activeWorkout) return {};
          const items = s.activeWorkout.items.map((it, i) => (i === itemIndex && it.sets.length > 1 ? { ...it, sets: it.sets.slice(0, -1) } : it));
          return { activeWorkout: { ...s.activeWorkout, items } };
        }),
      finishWorkout: () => {
        const { activeWorkout: aw, workouts } = get();
        if (!aw) return null;
        const items = aw.items.map((it) => ({ ...it, sets: it.sets.filter((st) => st.done) })).filter((it) => it.sets.length > 0);
        if (items.length === 0) {
          set({ activeWorkout: null });
          return null;
        }
        const log: WorkoutLog = {
          id: uid(),
          date: todayKey(),
          dayName: aw.dayName,
          durationMin: Math.max(1, Math.round((Date.now() - aw.startedAt) / 60000)),
          items,
        };
        set({ workouts: [log, ...workouts], activeWorkout: null });
        return log;
      },
      cancelWorkout: () => set({ activeWorkout: null }),
      removeWorkout: (id) => set((s) => ({ workouts: s.workouts.filter((w) => w.id !== id) })),

      saveEquipment: (e) => set((s) => ({ equipment: [e, ...s.equipment.filter((x) => x.id !== e.id)].slice(0, 30) })),
      removeEquipment: (id) => set((s) => ({ equipment: s.equipment.filter((x) => x.id !== id) })),

      addActivity: (a) => set((s) => ({ activities: [a, ...s.activities.filter((x) => x.id !== a.id)] })),
      updateActivity: (id, patch) => set((s) => ({ activities: s.activities.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
      removeActivity: (id) => set((s) => ({ activities: s.activities.filter((a) => a.id !== id) })),
      saveRoute: (r) => set((s) => ({ routes: [r, ...s.routes.filter((x) => x.id !== r.id)] })),
      removeRoute: (id) => set((s) => ({ routes: s.routes.filter((r) => r.id !== id) })),
      setLastLoc: (lat, lon) => set({ lastLoc: { lat, lon } }),

      setAi: (patch) => set((s) => ({ ai: { ...s.ai, ...patch } })),
      setTheme: (theme) => set({ theme }),

      importData: (raw) => {
        if (!raw || typeof raw !== 'object') throw new Error('Archivo de respaldo no válido');
        const src = raw as Record<string, unknown>;
        if (!('entries' in src) || !Array.isArray(src.entries)) throw new Error('Archivo de respaldo no válido');
        const next: Record<string, unknown> = {};
        for (const k of DATA_KEYS) {
          if (!(k in src) || k === 'ai' || k === 'activeWorkout') continue;
          // Solo se aceptan valores con la misma forma que los datos de la app.
          const expected = initial[k];
          const value = src[k];
          const ok = Array.isArray(expected)
            ? Array.isArray(value)
            : typeof expected === 'string'
              ? typeof value === 'string'
              : value === null || (typeof value === 'object' && !Array.isArray(value));
          if (ok) next[k] = value;
        }
        if (next.theme !== 'light' && next.theme !== 'dark') next.theme = 'system';
        set({ ...initial, ai: get().ai, ...(next as Partial<Data>), activeWorkout: null });
      },
      resetAll: () => set({ ...initial }),
    }),
    {
      name: 'healty-v1',
      version: 2,
      // v2: la app pasó a tema oscuro por defecto.
      migrate: (persisted, version) => (version < 2 ? { ...(persisted as object), theme: 'dark' } : persisted) as Data & Actions,
      partialize: (s) => Object.fromEntries(DATA_KEYS.map((k) => [k, s[k]])) as unknown as Data & Actions,
    },
  ),
);

function lastSetsFor(workouts: WorkoutLog[], exerciseId: string): SetLog[] | undefined {
  for (const w of workouts) {
    const it = w.items.find((i) => i.exerciseId === exerciseId);
    if (it && it.sets.length > 0) return it.sets;
  }
  return undefined;
}

export function lastPerformance(workouts: WorkoutLog[], exerciseId: string): { date: string; sets: SetLog[] } | null {
  for (const w of workouts) {
    const it = w.items.find((i) => i.exerciseId === exerciseId);
    if (it && it.sets.length > 0) return { date: w.date, sets: it.sets };
  }
  return null;
}

/** Datos del respaldo: todo menos las claves de IA. */
export function exportData(): string {
  const s = useStore.getState();
  const out: Record<string, unknown> = { app: 'healty', exportedAt: new Date().toISOString() };
  for (const k of DATA_KEYS) if (k !== 'ai' && k !== 'activeWorkout') out[k] = s[k];
  return JSON.stringify(out);
}

export function currentWeight(s: Pick<Data, 'profile' | 'weights'>): number {
  return s.weights.length > 0 ? s.weights[s.weights.length - 1].kg : (s.profile?.startWeightKg ?? 70);
}

export function useCurrentWeight(): number {
  return useStore((s) => currentWeight(s));
}

export function useTargets(): Targets {
  const profile = useStore((s) => s.profile);
  const override = useStore((s) => s.targetsOverride);
  const weight = useCurrentWeight();
  if (override) return override;
  if (!profile) return { kcal: 2000, protein: 120, carbs: 220, fat: 65 };
  return computeTargets(profile, weight);
}

/* ---------- Estado de interfaz (no se guarda) ---------- */

export interface FoodDraft {
  food: Food;
  grams: number;
  meal: MealId;
  /** Si existe, se está editando un registro ya guardado. */
  entryId?: string;
}

interface UiState {
  date: string;
  draft: FoodDraft | null;
  toast: string | null;
  setDate: (d: string) => void;
  setDraft: (d: FoodDraft | null) => void;
  showToast: (msg: string) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useUi = create<UiState>((set) => ({
  date: todayKey(),
  draft: null,
  toast: null,
  setDate: (date) => set({ date }),
  setDraft: (draft) => set({ draft }),
  showToast: (toast) => {
    set({ toast });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 2600);
  },
}));
