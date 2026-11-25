import { describe, expect, it } from 'vitest';
import { aiItemToFood } from '../src/lib/ai';
import { EXERCISES, candidates, getExercise, imagesUrl, videoUrl } from '../src/lib/exercises';
import { BASE_FOODS, searchFoods } from '../src/lib/foods';
import { type Pt, TERRAIN, computeStats, estimateKcal, estimateSeconds, fmtDuration, fmtPace, haversine, profile, splits, toGpx } from '../src/lib/geo';
import { parseOverpass } from '../src/lib/osm';
import { decodeTerrarium, tilePos, tilesForBounds } from '../src/lib/terrain';
import { describeWeather } from '../src/lib/weather';
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
    const full = mapOffProduct({
      code: '9',
      product_name: 'Cereal',
      image_front_small_url: 'https://images.openfoodfacts.org/x.jpg',
      nutriments: { 'energy-kcal_100g': 380, fiber_100g: 7.25, sugars_100g: 21, 'saturated-fat_100g': 0.5, salt_100g: 1 },
    })!;
    expect(full).toMatchObject({ fiber: 7.3, sugars: 21, satFat: 0.5, sodium: 400, image: 'https://images.openfoodfacts.org/x.jpg' });
    expect(mapOffProduct({ product_name: 'Raro', image_front_small_url: 'javascript:alert(1)', nutriments: { 'energy-kcal_100g': 1 } })?.image).toBeUndefined();
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

describe('montaña', () => {
  // Recorrido sintético: 2 km hacia el norte subiendo 300 m, con un punto cada 10 s.
  const track = (): Pt[] => {
    const out: Pt[] = [];
    for (let i = 0; i <= 100; i++) out.push([i * 10000, -33.4 + (i * 20) / 111195, -70.6, 800 + i * 3 + (i % 2 === 0 ? 0.8 : -0.8)]);
    return out;
  };

  it('mide distancias entre coordenadas', () => {
    expect(haversine(-33.4, -70.6, -33.4, -70.6)).toBe(0);
    expect(haversine(0, 0, 1, 0)).toBeCloseTo(111195, -2);
  });

  it('calcula distancia, tiempo y desnivel sin inflarlo con el ruido del GPS', () => {
    const st = computeStats(track(), 'hike');
    expect(st.distanceM).toBeCloseTo(2000, -1);
    expect(st.movingSec).toBe(1000);
    expect(st.ascentM).toBeGreaterThan(285);
    expect(st.ascentM).toBeLessThan(305);
    expect(st.descentM).toBe(0);
    // El suavizado recorta un poco el último punto.
    expect(Math.round(st.maxEle!)).toBeGreaterThanOrEqual(1095);
  });

  it('con altitudes del terreno suma el desnivel exacto, sin recortar los extremos', () => {
    const pts: Pt[] = Array.from({ length: 21 }, (_, i) => [0, -33.4 + i * 0.0005, -70.6, 950 + i * 12]);
    expect(computeStats(pts, 'hike', TERRAIN).ascentM).toBe(240);
  });

  it('no cuenta el tiempo detenido ni la distancia de una pausa', () => {
    const pts = track();
    // 5 minutos detenido en el mismo lugar y luego un tramo nuevo tras la pausa, 500 m más allá.
    const last = pts[pts.length - 1];
    pts.push([last[0] + 100000, last[1], last[2], last[3]], [last[0] + 300000, last[1], last[2], last[3]]);
    pts.push([last[0] + 900000, last[1] + 500 / 111195, last[2], last[3], 1], [last[0] + 910000, last[1] + 520 / 111195, last[2], last[3]]);
    const st = computeStats(pts, 'hike');
    expect(st.distanceM).toBeCloseTo(2020, -1);
    expect(st.movingSec).toBe(1010);
  });

  it('arma parciales por kilómetro y perfil de altitud', () => {
    const parts = splits(track(), 'hike');
    expect(parts).toHaveLength(2);
    expect(parts[0].sec).toBeGreaterThanOrEqual(490);
    expect(parts[0].sec).toBeLessThanOrEqual(520);
    expect(parts[0].eleChange).toBeGreaterThan(140);
    const prof = profile(track());
    expect(prof[prof.length - 1].dist).toBeCloseTo(2000, -1);
  });

  it('da formato a tiempos y ritmos', () => {
    expect(fmtDuration(59)).toBe('0:59');
    expect(fmtDuration(3725)).toBe('1:02:05');
    expect(fmtPace(1000, 600)).toBe('10:00');
    expect(fmtPace(5, 600)).toBe('–');
    expect(estimateSeconds(4500, 450, 'hike')).toBe(7200);
    expect(estimateKcal('hike', 80, 3600, 500)).toBe(584);
  });

  it('exporta GPX válido y escapa el nombre', () => {
    const gpx = toGpx('Cerro <A> & B', track().slice(0, 3));
    expect(gpx).toContain('<name>Cerro &lt;A&gt; &amp; B</name>');
    expect(gpx.match(/<trkpt /g)).toHaveLength(3);
    expect(gpx).toContain('<ele>800.8</ele>');
    expect(gpx).toContain('<time>1970-01-01T00:00:10.000Z</time>');
  });

  it('interpreta el clima', () => {
    expect(describeWeather(0).label).toBe('Despejado');
    expect(describeWeather(63).kind).toBe('rain');
    expect(describeWeather(96).kind).toBe('storm');
  });
});

describe('mapas sin conexión', () => {
  it('ubica coordenadas en la cuadrícula de teselas', () => {
    // Cerro Manquehue: tesela verificada contra el servicio real.
    const p = tilePos(-33.353, -70.578, 14);
    expect([Math.floor(p.x), Math.floor(p.y)]).toEqual([4979, 9803]);
    expect(tilePos(0, 0, 1)).toEqual({ x: 1, y: 1 });
  });

  it('lista las teselas que cubren una zona en todos los niveles', () => {
    const tiles = tilesForBounds({ s: -33.40, w: -70.62, n: -33.30, e: -70.50 });
    expect(new Set(tiles.map((t) => t.z))).toEqual(new Set([10, 11, 12, 13, 14]));
    expect(tiles.filter((t) => t.z === 10)).toHaveLength(1);
    expect(tiles.filter((t) => t.z === 14).length).toBeGreaterThan(20);
    expect(tiles.length).toBeLessThan(120);
  });

  it('decodifica la altitud de un píxel de relieve', () => {
    expect(decodeTerrarium(128, 0, 0)).toBe(0);
    expect(decodeTerrarium(134, 102, 0)).toBe(1638);
    expect(decodeTerrarium(127, 246, 128)).toBe(-9.5);
  });

  it('convierte datos de OpenStreetMap y descarta lo que no sirve', () => {
    const data = parseOverpass({
      elements: [
        { type: 'way', tags: { highway: 'path', name: 'Sendero <b>Norte</b>' }, geometry: [{ lat: -33.35, lon: -70.57 }, { lat: -33.351234567, lon: -70.571 }] },
        { type: 'way', tags: { highway: 'residential', name: 'Calle Uno' }, geometry: [{ lat: -33.4, lon: -70.6 }, { lat: -33.41, lon: -70.6 }] },
        { type: 'way', tags: { waterway: 'stream' }, geometry: [{ lat: -33.4, lon: -70.6 }, { lat: -33.41, lon: -70.61 }] },
        { type: 'way', tags: { highway: 'proposed' }, geometry: [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }] },
        { type: 'way', tags: { highway: 'path' }, geometry: [{ lat: 1, lon: 1 }] },
        { type: 'node', lat: -33.353, lon: -70.578, tags: { natural: 'peak', name: 'Cerro Manquehue', ele: '1638' } },
        { type: 'node', lat: -33.36, lon: -70.58, tags: { natural: 'peak' } },
        { type: 'node', lat: -33.37, lon: -70.59, tags: { natural: 'spring' } },
      ],
    });
    expect(data.ways.map((w) => w.k)).toEqual(['path', 'minor', 'water']);
    expect(data.ways[0]).toEqual({ k: 'path', n: 'Sendero <b>Norte</b>', p: [-33.35, -70.57, -33.35123, -70.571] });
    expect(data.ways[1].n).toBeUndefined();
    expect(data.pois).toEqual([
      { k: 'peak', n: 'Cerro Manquehue', ele: 1638, lat: -33.353, lon: -70.578 },
      { k: 'spring', n: undefined, ele: undefined, lat: -33.37, lon: -70.59 },
    ]);
    expect(parseOverpass(null)).toEqual({ ways: [], pois: [] });
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
