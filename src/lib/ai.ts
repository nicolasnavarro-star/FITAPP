import Anthropic from '@anthropic-ai/sdk';
import type { AiSettings, EquipmentExercise, Food } from './types';
import { uid } from './util';

/** Un alimento detectado por la IA, con los totales estimados para la porción. */
export interface AiItem {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface AiResult {
  items: AiItem[];
  notes: string;
}

export interface AiInput {
  /** Imagen JPEG en base64 (sin el prefijo data:). */
  imageBase64?: string;
  /** Descripción o aclaraciones del usuario. */
  text?: string;
}

export interface EquipmentResult {
  equipment: string;
  summary: string;
  exercises: EquipmentExercise[];
}

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (más preciso)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (equilibrado)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (más económico)' },
];
export const DEFAULT_CLAUDE_MODEL = CLAUDE_MODELS[0].id;

export class AiError extends Error {}

/** Tipo de dato simple para describir la respuesta esperada; se traduce al formato de cada proveedor. */
type Shape = 'string' | 'number' | { array: Shape } | { object: Record<string, Shape> };

function toGeminiSchema(s: Shape): unknown {
  if (s === 'string') return { type: 'STRING' };
  if (s === 'number') return { type: 'NUMBER' };
  if ('array' in s) return { type: 'ARRAY', items: toGeminiSchema(s.array) };
  return {
    type: 'OBJECT',
    properties: Object.fromEntries(Object.entries(s.object).map(([k, v]) => [k, toGeminiSchema(v)])),
    required: Object.keys(s.object),
  };
}

function toJsonSchema(s: Shape): Record<string, unknown> {
  if (s === 'string' || s === 'number') return { type: s };
  if ('array' in s) return { type: 'array', items: toJsonSchema(s.array) };
  return {
    type: 'object',
    properties: Object.fromEntries(Object.entries(s.object).map(([k, v]) => [k, toJsonSchema(v)])),
    required: Object.keys(s.object),
    additionalProperties: false,
  };
}

interface JsonRequest {
  system: string;
  text: string;
  imageBase64?: string;
  shape: Shape;
}

function parseJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new AiError('La IA devolvió una respuesta que no se pudo interpretar. Intenta de nuevo.');
  }
}

/* ---------- Gemini (Google AI Studio, tiene nivel gratuito) ---------- */

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';

async function geminiError(res: Response): Promise<AiError> {
  let detail = '';
  try {
    detail = ((await res.json()) as { error?: { message?: string } }).error?.message ?? '';
  } catch {
    /* sin cuerpo JSON */
  }
  if (res.status === 400 && /api key/i.test(detail)) return new AiError('La clave de Gemini no es válida. Revísala en Perfil → Inteligencia artificial.');
  if (res.status === 401 || res.status === 403) return new AiError('La clave de Gemini no es válida o no tiene permisos.');
  if (res.status === 429) return new AiError('Se alcanzó el límite de uso gratuito de Gemini. Espera un minuto e intenta de nuevo.');
  if (res.status >= 500) return new AiError('Gemini no está disponible en este momento. Intenta de nuevo en unos segundos.');
  return new AiError(`Gemini respondió con un error (${res.status}). ${detail}`.trim());
}

async function listGeminiModels(key: string): Promise<string[]> {
  const res = await fetch(`${GEMINI}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
  if (!res.ok) throw await geminiError(res);
  const data = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  return (data.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
}

const geminiVersion = (name: string) => parseFloat(name.split('-')[1]) || 0;

/** Elige el modelo "flash" más reciente disponible para la clave. */
export async function pickGeminiModel(key: string): Promise<string> {
  const names = (await listGeminiModels(key)).filter((n) => /^gemini-[\d.]+-flash(-latest)?$/.test(n));
  if (names.length === 0) throw new AiError('Tu clave de Gemini no tiene modelos compatibles disponibles.');
  return names.sort((a, b) => geminiVersion(b) - geminiVersion(a))[0];
}

function geminiGenerate(key: string, model: string, req: JsonRequest): Promise<Response> {
  const parts: unknown[] = [];
  if (req.imageBase64) parts.push({ inlineData: { mimeType: 'image/jpeg', data: req.imageBase64 } });
  parts.push({ text: req.text });
  return fetch(`${GEMINI}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: toGeminiSchema(req.shape) },
    }),
  });
}

async function jsonWithGemini(ai: AiSettings, req: JsonRequest, onModel?: (m: string) => void): Promise<unknown> {
  let model = ai.geminiModel || DEFAULT_GEMINI_MODEL;
  let res = await geminiGenerate(ai.geminiKey, model, req);
  if (res.status === 404) {
    // El modelo guardado ya no existe: buscar uno vigente y reintentar una vez.
    model = await pickGeminiModel(ai.geminiKey);
    onModel?.(model);
    res = await geminiGenerate(ai.geminiKey, model, req);
  }
  if (!res.ok) throw await geminiError(res);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
  if (!text) throw new AiError('Gemini no devolvió ningún resultado para esta imagen. Prueba con otra foto.');
  return parseJson(text);
}

/* ---------- Claude (API de Anthropic, de pago por uso) ---------- */

/** Modelos que admiten reintento automático en otro modelo si el principal declina la solicitud. */
const SERVER_FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);

function claudeClient(key: string): Anthropic {
  // La clave la ingresa el propio usuario y solo vive en su teléfono.
  return new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 });
}

function claudeError(e: unknown): AiError {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new AiError('La clave de Claude no es válida. Revísala en Perfil → Inteligencia artificial.');
  }
  if (e instanceof Anthropic.RateLimitError) return new AiError('Se alcanzó el límite de uso de Claude. Espera un momento e intenta de nuevo.');
  if (e instanceof Anthropic.NotFoundError) return new AiError('El modelo de Claude elegido no está disponible para tu cuenta.');
  if (e instanceof Anthropic.APIConnectionError) return new AiError('No se pudo conectar con Claude. Revisa tu conexión a internet.');
  if (e instanceof Anthropic.APIError) return new AiError(`Claude respondió con un error (${e.status ?? 's/n'}). ${e.message}`);
  return new AiError('Ocurrió un error inesperado al consultar a Claude.');
}

async function jsonWithClaude(ai: AiSettings, req: JsonRequest): Promise<unknown> {
  const client = claudeClient(ai.claudeKey);
  const model = ai.claudeModel || DEFAULT_CLAUDE_MODEL;
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (req.imageBase64) {
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: req.imageBase64 } });
  }
  content.push({ type: 'text', text: req.text });
  const fallback = SERVER_FALLBACK_MODELS.has(model);
  try {
    const res = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      system: req.system,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: toJsonSchema(req.shape) } },
      messages: [{ role: 'user', content }],
      ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    });
    if (res.stop_reason === 'refusal') throw new AiError('Claude no pudo analizar esta imagen. Prueba con otra foto.');
    if (res.stop_reason === 'max_tokens') throw new AiError('La respuesta de Claude quedó incompleta. Intenta de nuevo.');
    return parseJson(res.content.map((b) => (b.type === 'text' ? b.text : '')).join(''));
  } catch (e) {
    throw e instanceof AiError ? e : claudeError(e);
  }
}

/* ---------- Núcleo común ---------- */

export function aiReady(ai: AiSettings): boolean {
  return ai.provider === 'gemini' ? ai.geminiKey.trim() !== '' : ai.claudeKey.trim() !== '';
}

async function runJson(ai: AiSettings, req: JsonRequest, onGeminiModel?: (m: string) => void): Promise<unknown> {
  if (!aiReady(ai)) throw new AiError('Primero configura tu clave de IA en Perfil → Inteligencia artificial.');
  try {
    return ai.provider === 'gemini' ? await jsonWithGemini(ai, req, onGeminiModel) : await jsonWithClaude(ai, req);
  } catch (e) {
    if (e instanceof AiError) throw e;
    throw new AiError('No se pudo conectar con el servicio de IA. Revisa tu conexión a internet.');
  }
}

/** Verifica la clave. Devuelve el modelo que se usará. */
export async function testAi(ai: AiSettings): Promise<string> {
  if (ai.provider === 'gemini') {
    try {
      return await pickGeminiModel(ai.geminiKey.trim());
    } catch (e) {
      throw e instanceof AiError ? e : new AiError('No se pudo conectar con Gemini. Revisa tu conexión a internet.');
    }
  }
  try {
    const model = ai.claudeModel || DEFAULT_CLAUDE_MODEL;
    await claudeClient(ai.claudeKey.trim()).models.retrieve(model);
    return model;
  } catch (e) {
    throw claudeError(e);
  }
}

/* ---------- Comidas ---------- */

const MEAL_PROMPT = `Eres un nutricionista experto en estimar porciones a partir de fotos y descripciones de comida.
Identifica cada alimento o ingrediente relevante por separado (por ejemplo: arroz, pollo, ensalada, aliño).
Para cada uno estima el peso de la porción en gramos (o ml si es líquido) y sus calorías y macronutrientes TOTALES para esa porción.
Usa nombres cortos en español. Sé realista con los tamaños: usa platos, cubiertos y manos como referencia de escala.
Incluye aceites, salsas y aliños visibles o probables. Si la imagen es una etiqueta nutricional o un producto envasado, usa esos datos.
Si no hay comida, devuelve una lista vacía y explica por qué en "notes".
En "notes" escribe una frase breve con los supuestos principales de la estimación.`;

const MEAL_SHAPE: Shape = {
  object: {
    items: { array: { object: { name: 'string', grams: 'number', kcal: 'number', protein_g: 'number', carbs_g: 'number', fat_g: 'number' } } },
    notes: 'string',
  },
};

function sanitizeMeal(raw: unknown): AiResult {
  const obj = (raw ?? {}) as { items?: unknown; notes?: unknown };
  const list = Array.isArray(obj.items) ? obj.items : [];
  const n = (v: unknown) => {
    const x = Number(v);
    return isFinite(x) && x > 0 ? x : 0;
  };
  const items: AiItem[] = [];
  for (const it of list as Record<string, unknown>[]) {
    const name = String(it?.name ?? '').trim();
    const grams = n(it?.grams);
    if (!name || grams <= 0) continue;
    items.push({
      name,
      grams: Math.round(grams),
      kcal: Math.round(n(it.kcal)),
      protein: Math.round(n(it.protein_g) * 10) / 10,
      carbs: Math.round(n(it.carbs_g) * 10) / 10,
      fat: Math.round(n(it.fat_g) * 10) / 10,
    });
  }
  return { items, notes: typeof obj.notes === 'string' ? obj.notes : '' };
}

export async function analyzeMeal(ai: AiSettings, input: AiInput, onGeminiModel?: (m: string) => void): Promise<AiResult> {
  const extra = input.text?.trim();
  if (!input.imageBase64 && !extra) throw new AiError('Agrega una foto o describe la comida.');
  const text = input.imageBase64
    ? extra
      ? `Analiza la comida de la foto. Información adicional del usuario: ${extra}`
      : 'Analiza la comida de la foto.'
    : `Estima los valores nutricionales de esta comida: ${extra}`;
  return sanitizeMeal(await runJson(ai, { system: MEAL_PROMPT, text, imageBase64: input.imageBase64, shape: MEAL_SHAPE }, onGeminiModel));
}

/** Convierte un resultado de IA en un alimento por 100 g para poder ajustar la cantidad después. */
export function aiItemToFood(item: AiItem): Food {
  const f = 100 / item.grams;
  const r1 = (v: number) => Math.round(v * f * 10) / 10;
  return {
    id: `ai-${uid()}`,
    name: item.name,
    kcal: Math.round(item.kcal * f),
    protein: r1(item.protein),
    carbs: r1(item.carbs),
    fat: r1(item.fat),
    unit: 'g',
    source: 'ai',
  };
}

/* ---------- Búsqueda de alimentos por nombre ---------- */

const LOOKUP_PROMPT = `Eres una base de datos nutricional. El usuario escribe el nombre de un alimento, plato, bebida o producto de marca
(el usuario está en Chile, así que prioriza productos y preparaciones conocidos allí, pero acepta cualquiera).
Devuelve entre 1 y 4 coincidencias, de la más probable a la menos, con sus valores POR 100 g (o por 100 ml si es líquido).
Si es un producto de marca que conoces, usa los valores de su etiqueta e indica la marca; si no conoces la marca, deja "brand" vacío.
Si el nombre es ambiguo (por ejemplo "empanada"), devuelve las variantes más comunes como coincidencias separadas.
"unit" es "g" o "ml". "portion_label" es la porción habitual (por ejemplo "1 unidad", "1 vaso") y "portion_grams" su peso en gramos o ml.
"sodium_mg" va en miligramos. Si no conoces un valor de fibra, azúcares, grasa saturada o sodio, usa -1.
Si el texto no es un alimento, devuelve una lista vacía.`;

const NUTRITION_FIELDS = {
  kcal: 'number',
  protein_g: 'number',
  carbs_g: 'number',
  fat_g: 'number',
  fiber_g: 'number',
  sugars_g: 'number',
  sat_fat_g: 'number',
  sodium_mg: 'number',
} as const;

const LOOKUP_SHAPE: Shape = {
  object: {
    foods: { array: { object: { name: 'string', brand: 'string', unit: 'string', portion_label: 'string', portion_grams: 'number', ...NUTRITION_FIELDS } } },
  },
};

function foodFromAi(it: Record<string, unknown>, source: Food['source']): Food | null {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const req = (v: unknown) => {
    const x = Number(v);
    return isFinite(x) && x >= 0 ? x : 0;
  };
  const opt = (v: unknown) => {
    const x = Number(v);
    return isFinite(x) && x >= 0 ? Math.round(x * 10) / 10 : undefined;
  };
  const name = str(it.name);
  const kcal = Number(it.kcal);
  if (!name || !isFinite(kcal) || kcal < 0 || kcal > 950) return null;
  const grams = req(it.portion_grams);
  const sodium = opt(it.sodium_mg);
  return {
    id: `${source}-${uid()}`,
    name,
    brand: str(it.brand) || undefined,
    kcal: Math.round(kcal),
    protein: Math.round(req(it.protein_g) * 10) / 10,
    carbs: Math.round(req(it.carbs_g) * 10) / 10,
    fat: Math.round(req(it.fat_g) * 10) / 10,
    unit: str(it.unit) === 'ml' ? 'ml' : 'g',
    fiber: opt(it.fiber_g),
    sugars: opt(it.sugars_g),
    satFat: opt(it.sat_fat_g),
    sodium: sodium === undefined ? undefined : Math.round(sodium),
    portion: grams > 0 && grams <= 2000 ? { label: str(it.portion_label) || '1 porción', grams: Math.round(grams) } : undefined,
    source,
  };
}

/** Busca un alimento por nombre con IA: útil para platos caseros o productos que no están en las bases de datos. */
export async function lookupFoods(ai: AiSettings, query: string, onGeminiModel?: (m: string) => void): Promise<Food[]> {
  const raw = (await runJson(ai, { system: LOOKUP_PROMPT, text: `Alimento buscado: ${query.trim()}`, shape: LOOKUP_SHAPE }, onGeminiModel)) as { foods?: unknown };
  const list = Array.isArray(raw?.foods) ? (raw.foods as Record<string, unknown>[]) : [];
  return list.map((it) => foodFromAi(it, 'ai')).filter((f): f is Food => f !== null).slice(0, 4);
}

/* ---------- Lectura de etiquetas nutricionales ---------- */

const LABEL_PROMPT = `Lees etiquetas de información nutricional de productos envasados a partir de una foto.
Transcribe EXACTAMENTE los valores impresos en la columna "por 100 g" (o "por 100 ml"). No estimes ni redondees.
Si la etiqueta solo trae valores por porción, conviértelos a 100 g/ml usando el tamaño de porción impreso.
"name" y "brand" son el nombre y la marca del producto si se ven en la foto; si no, déjalos vacíos.
"unit" es "g" o "ml". "portion_label" describe la porción impresa (por ejemplo "1 porción (30 g)") y "portion_grams" es su tamaño.
"sodium_mg" va en miligramos por 100 g/ml. Si un valor no aparece en la etiqueta, usa -1.
"readable" es "si" cuando la foto muestra una tabla nutricional legible y "no" en caso contrario.`;

const LABEL_SHAPE: Shape = {
  object: { readable: 'string', name: 'string', brand: 'string', unit: 'string', portion_label: 'string', portion_grams: 'number', ...NUTRITION_FIELDS },
};

/** Lee la tabla nutricional de una foto y devuelve los valores impresos por 100 g/ml. */
export async function readLabel(ai: AiSettings, imageBase64: string, onGeminiModel?: (m: string) => void): Promise<Food> {
  const raw = (await runJson(
    ai,
    { system: LABEL_PROMPT, text: 'Lee la información nutricional de esta etiqueta.', imageBase64, shape: LABEL_SHAPE },
    onGeminiModel,
  )) as Record<string, unknown>;
  const readable = String(raw?.readable ?? '').toLowerCase().startsWith('s');
  const food = readable ? foodFromAi({ ...raw, name: String(raw.name || '').trim() || 'Producto' }, 'custom') : null;
  if (!food) throw new AiError('No se pudo leer una tabla nutricional en la foto. Acércate a la etiqueta y evita reflejos.');
  if (!String(raw.name || '').trim()) food.name = '';
  return food;
}

/* ---------- Equipamiento de ejercicio ---------- */

const EQUIPMENT_PROMPT = `Eres un entrenador personal certificado. El usuario te muestra o describe un equipo de ejercicio que tiene disponible
(máquina, mancuernas, barra, banco, banda elástica, kettlebell, polea, etc.) y quiere saber qué puede entrenar con él.
1. Identifica el equipo con su nombre común en español ("equipment").
2. En "summary" explica en una o dos frases qué es y para qué sirve. Si no es el equipo ideal para el grupo muscular pedido, dilo aquí.
3. Sugiere entre 3 y 5 ejercicios que se puedan hacer con ESE equipo para el grupo muscular pedido, ordenados del más recomendable al menos.
   Si no se pidió un grupo muscular, elige los ejercicios más útiles y variados.
Para cada ejercicio entrega: "name" (nombre común en español), "muscles" (músculos principales), "sets_reps" (por ejemplo "3 series de 10-12"),
"steps" (3 a 5 pasos breves y concretos para ejecutarlo bien, incluyendo cómo ajustar el equipo si aplica) y "tip" (el error más común o un consejo de seguridad).
Si la foto no muestra un equipo de ejercicio, devuelve "exercises" vacío y explica por qué en "summary".`;

const EQUIPMENT_SHAPE: Shape = {
  object: {
    equipment: 'string',
    summary: 'string',
    exercises: { array: { object: { name: 'string', muscles: 'string', sets_reps: 'string', steps: { array: 'string' }, tip: 'string' } } },
  },
};

function sanitizeEquipment(raw: unknown): EquipmentResult {
  const obj = (raw ?? {}) as { equipment?: unknown; summary?: unknown; exercises?: unknown };
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const exercises: EquipmentExercise[] = [];
  for (const it of (Array.isArray(obj.exercises) ? obj.exercises : []) as Record<string, unknown>[]) {
    const name = str(it?.name);
    if (!name) continue;
    exercises.push({
      name,
      muscles: str(it.muscles),
      setsReps: str(it.sets_reps),
      steps: (Array.isArray(it.steps) ? it.steps : []).map(str).filter(Boolean).slice(0, 8),
      tip: str(it.tip),
    });
  }
  return { equipment: str(obj.equipment) || 'Equipo', summary: str(obj.summary), exercises: exercises.slice(0, 8) };
}

export interface EquipmentInput extends AiInput {
  /** Grupo muscular que se quiere trabajar; vacío para cualquiera. */
  muscle?: string;
}

export async function analyzeEquipment(ai: AiSettings, input: EquipmentInput, onGeminiModel?: (m: string) => void): Promise<EquipmentResult> {
  const extra = input.text?.trim();
  if (!input.imageBase64 && !extra) throw new AiError('Agrega una foto del equipo o descríbelo.');
  const goal = input.muscle ? `Quiero trabajar: ${input.muscle}.` : 'No tengo un grupo muscular específico en mente.';
  const text = input.imageBase64
    ? `Este es el equipo que tengo (foto). ${goal}${extra ? ` Información adicional: ${extra}` : ''}`
    : `El equipo que tengo es: ${extra}. ${goal}`;
  return sanitizeEquipment(await runJson(ai, { system: EQUIPMENT_PROMPT, text, imageBase64: input.imageBase64, shape: EQUIPMENT_SHAPE }, onGeminiModel));
}

/* ---------- Imágenes de referencia (solo Gemini) ---------- */

export function canGenerateImages(ai: AiSettings): boolean {
  return ai.provider === 'gemini' && ai.geminiKey.trim() !== '';
}

const IMAGE_UNAVAILABLE =
  'Tu clave de Gemini no permite generar imágenes (Google lo reserva para cuentas con facturación activada). Usa el video o las imágenes de referencia.';

/**
 * Genera una ilustración del ejercicio con un modelo de imágenes de Gemini.
 * Los modelos de imagen suelen estar fuera del nivel gratuito, así que un fallo aquí es esperable.
 */
export async function generateExerciseImage(
  ai: AiSettings,
  exercise: { name: string; muscles: string; steps: string[] },
  equipment: string,
  onModel?: (m: string) => void,
): Promise<string> {
  if (!canGenerateImages(ai)) throw new AiError('La generación de imágenes solo está disponible con Google Gemini.');
  const key = ai.geminiKey;
  let candidates: string[];
  try {
    const all = (await listGeminiModels(key)).filter((n) => /^gemini-.*image/.test(n));
    // Primero el modelo que ya funcionó; después los "lite" (más baratos) y los más recientes.
    candidates = all.sort((a, b) => Number(b.includes('lite')) - Number(a.includes('lite')) || geminiVersion(b) - geminiVersion(a));
    if (ai.geminiImageModel && all.includes(ai.geminiImageModel)) candidates = [ai.geminiImageModel, ...candidates.filter((c) => c !== ai.geminiImageModel)];
  } catch (e) {
    throw e instanceof AiError ? e : new AiError('No se pudo conectar con Gemini. Revisa tu conexión a internet.');
  }
  if (candidates.length === 0) throw new AiError(IMAGE_UNAVAILABLE);

  const prompt = `Ilustración instructiva, limpia y realista, estilo guía de gimnasio, fondo claro y liso, sin texto ni marcas de agua.
Muestra a una persona con ropa deportiva realizando correctamente el ejercicio "${exercise.name}" con ${equipment}.
Vista lateral de cuerpo completo, en dos momentos lado a lado: posición inicial y posición final del movimiento.
Músculos trabajados: ${exercise.muscles}. Técnica: ${exercise.steps.join(' ')}`;

  let lastStatus = 0;
  for (const model of candidates.slice(0, 3)) {
    let res: Response;
    try {
      res = await fetch(`${GEMINI}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }),
      });
    } catch {
      throw new AiError('No se pudo conectar con Gemini. Revisa tu conexión a internet.');
    }
    lastStatus = res.status;
    if (!res.ok) continue;
    const data = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[] };
    const img = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (img?.data) {
      onModel?.(model);
      return `data:${img.mimeType || 'image/png'};base64,${img.data}`;
    }
  }
  if (lastStatus >= 500) throw new AiError('Gemini no está disponible en este momento. Intenta de nuevo en unos segundos.');
  throw new AiError(IMAGE_UNAVAILABLE);
}

/* ---------- Fotos ---------- */

/** Reduce y comprime una foto para enviarla a la IA. Devuelve base64 JPEG y una URL de vista previa. */
export async function prepareImage(file: Blob, maxSide = 1280): Promise<{ base64: string; previewUrl: string; thumbUrl: string }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions).catch(() => createImageBitmap(file));
  const render = (side: number, quality: number) => {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  };
  const previewUrl = render(maxSide, 0.82);
  const thumbUrl = render(160, 0.7);
  bitmap.close();
  return { base64: previewUrl.split(',')[1], previewUrl, thumbUrl };
}
