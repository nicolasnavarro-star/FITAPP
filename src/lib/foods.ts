import type { Food } from './types';
import { norm } from './util';

/**
 * Base local de alimentos comunes (valores aproximados por 100 g o 100 ml).
 * Formato: [nombre, kcal, proteína, carbohidratos, grasa, porción?, gramos porción?, unidad?]
 */
type Row = [string, number, number, number, number, string?, number?, ('g' | 'ml')?];

const ROWS: Row[] = [
  // Cereales, panes y masas
  ['Arroz blanco cocido', 130, 2.7, 28, 0.3, '1 taza', 160],
  ['Arroz integral cocido', 123, 2.7, 25.6, 1, '1 taza', 160],
  ['Fideos / pasta cocida', 158, 5.8, 31, 0.9, '1 plato', 200],
  ['Avena en hojuelas', 379, 13, 67, 6.5, '½ taza', 40],
  ['Quinoa cocida', 120, 4.4, 21, 1.9, '1 taza', 185],
  ['Pan marraqueta / batido', 270, 8, 56, 1.5, '1 unidad', 100],
  ['Pan hallulla', 320, 8, 55, 7, '1 unidad', 90],
  ['Pan integral de molde', 250, 11, 43, 3.5, '1 rebanada', 30],
  ['Pan blanco de molde', 265, 8.5, 49, 3.3, '1 rebanada', 28],
  ['Tortilla de trigo', 310, 8, 50, 8, '1 unidad', 40],
  ['Tortilla de maíz', 218, 5.7, 45, 2.9, '1 unidad', 30],
  ['Galletas de agua / soda', 430, 9, 70, 12, '5 unidades', 30],
  ['Cereal de maíz (corn flakes)', 370, 7, 84, 0.9, '1 taza', 30],
  ['Granola', 450, 10, 64, 17, '½ taza', 50],
  ['Cuscús cocido', 112, 3.8, 23, 0.2, '1 taza', 160],
  ['Papas cocidas', 87, 1.9, 20, 0.1, '1 mediana', 150],
  ['Papas fritas', 312, 3.4, 41, 15, '1 porción', 120],
  ['Puré de papas', 105, 2, 16, 3.8, '1 taza', 200],
  ['Camote cocido', 90, 2, 21, 0.2, '1 mediano', 130],
  ['Choclo cocido', 96, 3.4, 21, 1.5, '1 unidad', 100],
  ['Sopaipilla', 330, 6, 45, 14, '1 unidad', 50],
  ['Empanada de pino (horno)', 250, 9, 28, 11, '1 unidad', 200],
  ['Pizza de queso', 266, 11, 33, 10, '1 trozo', 110],
  ['Hamburguesa con pan', 260, 13, 24, 12, '1 unidad', 180],
  ['Completo italiano', 240, 8, 22, 13, '1 unidad', 220],

  // Carnes, aves y pescados
  ['Pechuga de pollo cocida', 165, 31, 0, 3.6, '1 filete', 150],
  ['Trutro de pollo sin piel', 180, 25, 0, 8.5, '1 unidad', 120],
  ['Pavo (pechuga) cocido', 135, 29, 0, 1.6, '1 filete', 120],
  ['Carne de vacuno magra cocida', 190, 29, 0, 8, '1 bistec', 130],
  ['Carne molida 10 % grasa cocida', 215, 26, 0, 12, '1 porción', 120],
  ['Lomo de cerdo cocido', 195, 27, 0, 9, '1 porción', 120],
  ['Chuleta de cerdo', 240, 25, 0, 15, '1 unidad', 130],
  ['Salmón cocido', 206, 22, 0, 13, '1 filete', 150],
  ['Atún en agua (lata)', 116, 26, 0, 1, '1 lata', 120],
  ['Atún en aceite escurrido', 190, 27, 0, 9, '1 lata', 120],
  ['Merluza / pescado blanco', 105, 22, 0, 1.5, '1 filete', 150],
  ['Reineta', 110, 21, 0, 2.5, '1 filete', 150],
  ['Camarones cocidos', 99, 24, 0.2, 0.3, '1 porción', 100],
  ['Jamón de pavo', 105, 17, 2.5, 3, '2 láminas', 40],
  ['Jamón de cerdo', 145, 19, 1.5, 7, '2 láminas', 40],
  ['Vienesa / salchicha', 290, 11, 3, 26, '1 unidad', 50],
  ['Longaniza', 330, 15, 2, 29, '1 unidad', 80],
  ['Tocino', 540, 37, 1.4, 42, '2 tiras', 16],
  ['Huevo entero', 143, 12.6, 0.7, 9.5, '1 unidad', 50],
  ['Clara de huevo', 52, 11, 0.7, 0.2, '1 clara', 33],
  ['Huevo frito', 196, 13.6, 0.8, 15, '1 unidad', 46],

  // Lácteos
  ['Leche entera', 61, 3.2, 4.8, 3.3, '1 vaso', 200, 'ml'],
  ['Leche semidescremada', 46, 3.3, 4.8, 1.5, '1 vaso', 200, 'ml'],
  ['Leche descremada', 35, 3.4, 5, 0.1, '1 vaso', 200, 'ml'],
  ['Leche sin lactosa descremada', 36, 3.3, 5, 0.2, '1 vaso', 200, 'ml'],
  ['Bebida de almendras sin azúcar', 15, 0.5, 0.3, 1.2, '1 vaso', 200, 'ml'],
  ['Bebida de avena', 46, 1, 7, 1.5, '1 vaso', 200, 'ml'],
  ['Yogur natural', 61, 3.5, 4.7, 3.3, '1 pote', 125],
  ['Yogur griego natural', 97, 9, 3.9, 5, '1 pote', 150],
  ['Yogur proteico', 60, 10, 4, 0.3, '1 pote', 155],
  ['Yogur batido con azúcar', 85, 3, 14, 1.7, '1 pote', 125],
  ['Queso gauda / mantecoso', 356, 25, 2.2, 27, '1 lámina', 20],
  ['Queso fresco / quesillo', 110, 13, 3, 5, '1 trozo', 60],
  ['Queso cottage', 98, 11, 3.4, 4.3, '½ taza', 110],
  ['Queso crema', 342, 6, 4, 34, '1 cucharada', 15],
  ['Queso parmesano', 431, 38, 4, 29, '1 cucharada', 5],
  ['Mantequilla', 717, 0.9, 0.1, 81, '1 cucharadita', 5],
  ['Proteína de suero (whey) en polvo', 400, 80, 7, 6, '1 scoop', 30],

  // Legumbres y frutos secos
  ['Lentejas cocidas', 116, 9, 20, 0.4, '1 taza', 200],
  ['Porotos cocidos', 127, 8.7, 22.8, 0.5, '1 taza', 180],
  ['Garbanzos cocidos', 164, 8.9, 27, 2.6, '1 taza', 165],
  ['Tofu firme', 144, 15, 3, 9, '1 porción', 100],
  ['Maní tostado', 585, 24, 21, 50, '1 puñado', 30],
  ['Mantequilla de maní', 588, 25, 20, 50, '1 cucharada', 16],
  ['Almendras', 579, 21, 22, 50, '1 puñado', 30],
  ['Nueces', 654, 15, 14, 65, '1 puñado', 30],
  ['Semillas de chía', 486, 17, 42, 31, '1 cucharada', 12],

  // Frutas
  ['Plátano', 89, 1.1, 23, 0.3, '1 unidad', 120],
  ['Manzana', 52, 0.3, 14, 0.2, '1 unidad', 180],
  ['Naranja', 47, 0.9, 12, 0.1, '1 unidad', 150],
  ['Mandarina', 53, 0.8, 13, 0.3, '1 unidad', 80],
  ['Pera', 57, 0.4, 15, 0.1, '1 unidad', 170],
  ['Frutillas', 32, 0.7, 7.7, 0.3, '1 taza', 150],
  ['Arándanos', 57, 0.7, 14, 0.3, '1 taza', 140],
  ['Uvas', 69, 0.7, 18, 0.2, '1 taza', 150],
  ['Sandía', 30, 0.6, 7.6, 0.2, '1 tajada', 280],
  ['Melón', 34, 0.8, 8, 0.2, '1 tajada', 180],
  ['Piña', 50, 0.5, 13, 0.1, '1 rodaja', 100],
  ['Kiwi', 61, 1.1, 15, 0.5, '1 unidad', 75],
  ['Durazno', 39, 0.9, 10, 0.3, '1 unidad', 150],
  ['Mango', 60, 0.8, 15, 0.4, '1 taza', 165],
  ['Palta', 160, 2, 8.5, 14.7, '½ unidad', 80],
  ['Pasas', 299, 3, 79, 0.5, '1 puñado', 30],

  // Verduras
  ['Lechuga', 15, 1.4, 2.9, 0.2, '1 plato', 80],
  ['Tomate', 18, 0.9, 3.9, 0.2, '1 unidad', 120],
  ['Zanahoria', 41, 0.9, 9.6, 0.2, '1 unidad', 70],
  ['Brócoli cocido', 35, 2.4, 7, 0.4, '1 taza', 150],
  ['Espinaca', 23, 2.9, 3.6, 0.4, '1 taza', 30],
  ['Pepino', 15, 0.7, 3.6, 0.1, '½ unidad', 100],
  ['Cebolla', 40, 1.1, 9.3, 0.1, '½ unidad', 60],
  ['Pimentón', 31, 1, 6, 0.3, '½ unidad', 60],
  ['Zapallo italiano', 17, 1.2, 3.1, 0.3, '1 unidad', 200],
  ['Zapallo camote cocido', 26, 1, 6.5, 0.1, '1 taza', 200],
  ['Porotos verdes cocidos', 35, 1.9, 7.9, 0.3, '1 taza', 125],
  ['Champiñones', 22, 3.1, 3.3, 0.3, '1 taza', 70],
  ['Betarraga cocida', 44, 1.7, 10, 0.2, '1 unidad', 100],
  ['Ensalada mixta (sin aliño)', 20, 1.2, 4, 0.2, '1 plato', 150],

  // Grasas, salsas y aliños
  ['Aceite de oliva', 884, 0, 0, 100, '1 cucharada', 14, 'ml'],
  ['Aceite vegetal', 884, 0, 0, 100, '1 cucharada', 14, 'ml'],
  ['Mayonesa', 680, 1, 1, 75, '1 cucharada', 15],
  ['Mayonesa light', 260, 1, 9, 24, '1 cucharada', 15],
  ['Kétchup', 101, 1, 27, 0.1, '1 cucharada', 17],
  ['Mostaza', 60, 3.7, 5.8, 3.3, '1 cucharadita', 5],
  ['Salsa de tomate', 45, 1.5, 8, 0.8, '½ taza', 120],
  ['Pebre', 45, 1, 5, 2.5, '2 cucharadas', 30],
  ['Hummus', 166, 8, 14, 9.6, '2 cucharadas', 30],

  // Dulces y snacks
  ['Azúcar', 387, 0, 100, 0, '1 cucharadita', 5],
  ['Miel', 304, 0.3, 82, 0, '1 cucharadita', 7],
  ['Mermelada', 250, 0.4, 62, 0.1, '1 cucharada', 20],
  ['Manjar / dulce de leche', 315, 7, 55, 7.5, '1 cucharada', 20],
  ['Chocolate de leche', 535, 7.6, 59, 30, '4 cuadritos', 25],
  ['Chocolate amargo 70 %', 598, 7.8, 46, 43, '4 cuadritos', 25],
  ['Galletas dulces', 480, 6, 68, 20, '4 unidades', 40],
  ['Helado de crema', 207, 3.5, 24, 11, '1 bola', 70],
  ['Papas fritas de bolsa', 536, 7, 53, 34, '1 bolsa chica', 40],
  ['Barra de cereal', 400, 6, 70, 10, '1 unidad', 21],
  ['Barra de proteína', 370, 33, 35, 12, '1 unidad', 60],
  ['Queque / bizcocho', 350, 5, 52, 14, '1 trozo', 70],
  ['Alfajor', 430, 6, 62, 18, '1 unidad', 50],

  // Bebidas
  ['Bebida cola', 42, 0, 10.6, 0, '1 lata', 350, 'ml'],
  ['Bebida cola zero', 0.3, 0, 0, 0, '1 lata', 350, 'ml'],
  ['Jugo de naranja natural', 45, 0.7, 10.4, 0.2, '1 vaso', 250, 'ml'],
  ['Jugo en caja', 46, 0.2, 11, 0, '1 vaso', 200, 'ml'],
  ['Café solo', 1, 0.1, 0, 0, '1 taza', 240, 'ml'],
  ['Café con leche', 35, 1.9, 3, 1.8, '1 taza', 240, 'ml'],
  ['Té sin azúcar', 1, 0, 0.2, 0, '1 taza', 240, 'ml'],
  ['Cerveza', 43, 0.5, 3.6, 0, '1 lata', 350, 'ml'],
  ['Vino tinto', 85, 0.1, 2.6, 0, '1 copa', 150, 'ml'],
  ['Pisco / destilado', 231, 0, 0, 0, '1 medida', 45, 'ml'],
  ['Bebida isotónica', 25, 0, 6, 0, '1 botella', 500, 'ml'],

  // Platos preparados
  ['Cazuela de vacuno', 75, 5.5, 7, 2.8, '1 plato', 450],
  ['Pastel de choclo', 150, 7, 17, 6, '1 porción', 350],
  ['Porotos con riendas', 115, 5.5, 18, 2.2, '1 plato', 400],
  ['Charquicán', 95, 5, 11, 3.5, '1 plato', 350],
  ['Arroz con pollo', 150, 9, 19, 4, '1 plato', 350],
  ['Tallarines con salsa boloñesa', 150, 7.5, 19, 4.5, '1 plato', 380],
  ['Lasaña de carne', 160, 9, 14, 7.5, '1 porción', 300],
  ['Ensalada césar con pollo', 130, 9, 5, 8.5, '1 plato', 300],
  ['Sushi (roll)', 150, 5.5, 24, 3.5, '8 piezas', 200],
  ['Tortilla de huevo con verduras', 130, 8, 5, 9, '1 porción', 150],
  ['Sándwich de pollo y palta', 215, 12, 22, 9, '1 unidad', 250],
  ['Burrito de carne', 200, 9, 23, 8, '1 unidad', 250],
  ['Sopa de verduras', 35, 1.3, 6.5, 0.6, '1 plato', 350],
  ['Batido de proteína con leche', 80, 9.5, 5.5, 2, '1 vaso', 350, 'ml'],
];

export const BASE_FOODS: Food[] = ROWS.map(([name, kcal, protein, carbs, fat, label, grams, unit], i) => ({
  id: `base-${i}`,
  name,
  kcal,
  protein,
  carbs,
  fat,
  unit: unit ?? 'g',
  portion: label && grams ? { label, grams } : undefined,
  source: 'base',
}));

/** Búsqueda local: todas las palabras deben aparecer; prioriza coincidencias al inicio. */
export function searchFoods(query: string, extra: Food[] = [], limit = 40): Food[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const scored: { food: Food; score: number }[] = [];
  for (const food of [...extra, ...BASE_FOODS]) {
    const hay = norm(`${food.name} ${food.brand ?? ''}`);
    if (!words.every((w) => hay.includes(w))) continue;
    let score = hay.startsWith(words[0]) ? 0 : 1;
    if (food.source !== 'base') score -= 0.5;
    scored.push({ food, score: score + hay.length / 1000 });
  }
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((s) => s.food);
}
