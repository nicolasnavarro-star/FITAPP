import Anthropic from '@anthropic-ai/sdk';
import type { AiSettings, Food } from './types';
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

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (más preciso)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (equilibrado)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (más económico)' },
];
export const DEFAULT_CLAUDE_MODEL = CLAUDE_MODELS[0].id;

export class AiError extends Error {}

const PROMPT = `Eres un nutricionista experto en estimar porciones a partir de fotos y descripciones de comida.
Identifica cada alimento o ingrediente relevante por separado (por ejemplo: arroz, pollo, ensalada, aliño).
Para cada uno estima el peso de la porción en gramos (o ml si es líquido) y sus calorías y macronutrientes TOTALES para esa porción.
Usa nombres cortos en español. Sé realista con los tamaños: usa platos, cubiertos y manos como referencia de escala.
Incluye aceites, salsas y aliños visibles o probables. Si la imagen es una etiqueta nutricional o un producto envasado, usa esos datos.
Si no hay comida, devuelve una lista vacía y explica por qué en "notes".
En "notes" escribe una frase breve con los supuestos principales de la estimación.`;

function userText(input: AiInput): string {
  const extra = input.text?.trim();
  if (input.imageBase64) {
    return extra ? `Analiza la comida de la foto. Información adicional del usuario: ${extra}` : 'Analiza la comida de la foto.';
  }
  return `Estima los valores nutricionales de esta comida: ${extra}`;
}

function sanitize(raw: unknown): AiResult {
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

const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          grams: { type: 'NUMBER' },
          kcal: { type: 'NUMBER' },
          protein_g: { type: 'NUMBER' },
          carbs_g: { type: 'NUMBER' },
          fat_g: { type: 'NUMBER' },
        },
        required: ['name', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g'],
      },
    },
    notes: { type: 'STRING' },
  },
  required: ['items', 'notes'],
};

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

/** Lista los modelos disponibles para la clave y elige el "flash" más reciente con soporte de generateContent. */
export async function pickGeminiModel(key: string): Promise<string> {
  const res = await fetch(`${GEMINI}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
  if (!res.ok) throw await geminiError(res);
  const data = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  const names = (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /^gemini-[\d.]+-flash(-latest)?$/.test(n));
  if (names.length === 0) throw new AiError('Tu clave de Gemini no tiene modelos compatibles disponibles.');
  const version = (n: string) => parseFloat(n.split('-')[1]) || 0;
  names.sort((a, b) => version(b) - version(a));
  return names[0];
}

async function geminiGenerate(key: string, model: string, input: AiInput): Promise<Response> {
  const parts: unknown[] = [];
  if (input.imageBase64) parts.push({ inline_data: { mime_type: 'image/jpeg', data: input.imageBase64 } });
  parts.push({ text: userText(input) });
  return fetch(`${GEMINI}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: PROMPT }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: GEMINI_SCHEMA },
    }),
  });
}

async function analyzeWithGemini(ai: AiSettings, input: AiInput, onModel?: (m: string) => void): Promise<AiResult> {
  let model = ai.geminiModel || DEFAULT_GEMINI_MODEL;
  let res = await geminiGenerate(ai.geminiKey, model, input);
  if (res.status === 404) {
    // El modelo guardado ya no existe: buscar uno vigente y reintentar una vez.
    model = await pickGeminiModel(ai.geminiKey);
    onModel?.(model);
    res = await geminiGenerate(ai.geminiKey, model, input);
  }
  if (!res.ok) throw await geminiError(res);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    promptFeedback?: { blockReason?: string };
  };
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
  if (!text) throw new AiError('Gemini no devolvió ningún resultado para esta imagen. Prueba con otra foto.');
  return sanitize(parseJson(text));
}

/* ---------- Claude (API de Anthropic, de pago por uso) ---------- */

const CLAUDE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          grams: { type: 'number' },
          kcal: { type: 'number' },
          protein_g: { type: 'number' },
          carbs_g: { type: 'number' },
          fat_g: { type: 'number' },
        },
        required: ['name', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g'],
        additionalProperties: false,
      },
    },
    notes: { type: 'string' },
  },
  required: ['items', 'notes'],
  additionalProperties: false,
};

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

async function analyzeWithClaude(ai: AiSettings, input: AiInput): Promise<AiResult> {
  const client = claudeClient(ai.claudeKey);
  const model = ai.claudeModel || DEFAULT_CLAUDE_MODEL;
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (input.imageBase64) {
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: input.imageBase64 } });
  }
  content.push({ type: 'text', text: userText(input) });
  const fallback = SERVER_FALLBACK_MODELS.has(model);
  try {
    const res = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      system: PROMPT,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: CLAUDE_SCHEMA } },
      messages: [{ role: 'user', content }],
      ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    });
    if (res.stop_reason === 'refusal') throw new AiError('Claude no pudo analizar esta imagen. Prueba con otra foto.');
    if (res.stop_reason === 'max_tokens') throw new AiError('La respuesta de Claude quedó incompleta. Intenta de nuevo.');
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    return sanitize(parseJson(text));
  } catch (e) {
    throw e instanceof AiError ? e : claudeError(e);
  }
}

/* ---------- API pública ---------- */

export function aiReady(ai: AiSettings): boolean {
  return ai.provider === 'gemini' ? ai.geminiKey.trim() !== '' : ai.claudeKey.trim() !== '';
}

export async function analyzeMeal(ai: AiSettings, input: AiInput, onGeminiModel?: (m: string) => void): Promise<AiResult> {
  if (!aiReady(ai)) throw new AiError('Primero configura tu clave de IA en Perfil → Inteligencia artificial.');
  if (!input.imageBase64 && !input.text?.trim()) throw new AiError('Agrega una foto o describe la comida.');
  try {
    return ai.provider === 'gemini' ? await analyzeWithGemini(ai, input, onGeminiModel) : await analyzeWithClaude(ai, input);
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

/** Reduce y comprime una foto para enviarla a la IA. Devuelve base64 JPEG y una URL de vista previa. */
export async function prepareImage(file: Blob, maxSide = 1280): Promise<{ base64: string; previewUrl: string }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions).catch(() => createImageBitmap(file));
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  return { base64: dataUrl.split(',')[1], previewUrl: dataUrl };
}
