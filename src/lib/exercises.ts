import type { Equipment } from './types';

export type Pattern =
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'hpush'
  | 'vpush'
  | 'hpull'
  | 'vpull'
  | 'quad_iso'
  | 'ham_iso'
  | 'glute'
  | 'calf'
  | 'chest_iso'
  | 'delt_lat'
  | 'delt_rear'
  | 'biceps'
  | 'triceps'
  | 'core';

/** Equipamiento mínimo necesario: gimnasio completo, mancuernas o solo peso corporal. */
type Eq = 'gym' | 'db' | 'bw';

export interface Exercise {
  id: string;
  name: string;
  muscle: string;
  pattern: Pattern;
  eq: Eq;
  tips: string;
  /** Se mide en segundos en vez de repeticiones. */
  timed?: boolean;
}

type Row = [id: string, name: string, muscle: string, pattern: Pattern, eq: Eq, tips: string, timed?: boolean];

const ROWS: Row[] = [
  // Sentadilla
  ['back-squat', 'Sentadilla con barra', 'Cuádriceps y glúteos', 'squat', 'gym', 'Barra sobre los trapecios, pies al ancho de hombros. Baja hasta que los muslos queden paralelos al suelo, con el pecho arriba y las rodillas siguiendo la línea de los pies.'],
  ['leg-press', 'Prensa de piernas', 'Cuádriceps y glúteos', 'squat', 'gym', 'Pies al ancho de hombros en la plataforma. Baja controlado sin despegar la zona lumbar del respaldo y empuja sin bloquear las rodillas.'],
  ['hack-squat', 'Sentadilla hack', 'Cuádriceps', 'squat', 'gym', 'Espalda bien apoyada en el respaldo. Baja profundo y controlado, y sube empujando con todo el pie.'],
  ['goblet-squat', 'Sentadilla goblet', 'Cuádriceps y glúteos', 'squat', 'db', 'Sostén una mancuerna pegada al pecho. Baja con el torso erguido llevando los codos entre las rodillas.'],
  ['db-squat', 'Sentadilla con mancuernas', 'Cuádriceps y glúteos', 'squat', 'db', 'Una mancuerna en cada mano a los costados. Baja como si te sentaras en una silla, con la espalda recta.'],
  ['bw-squat', 'Sentadilla libre', 'Cuádriceps y glúteos', 'squat', 'bw', 'Brazos al frente para equilibrarte. Baja lento (3 segundos) y sube con fuerza. Mantén los talones apoyados.'],
  ['jump-squat', 'Sentadilla con salto', 'Cuádriceps y glúteos', 'squat', 'bw', 'Baja a media sentadilla y salta de forma explosiva. Aterriza suave, amortiguando con las piernas.'],

  // Bisagra de cadera
  ['rdl', 'Peso muerto rumano con barra', 'Isquiotibiales y glúteos', 'hinge', 'gym', 'Rodillas apenas flexionadas. Lleva la cadera hacia atrás deslizando la barra por las piernas hasta sentir el estiramiento atrás del muslo. Espalda siempre recta.'],
  ['deadlift', 'Peso muerto convencional', 'Espalda baja, glúteos e isquiotibiales', 'hinge', 'gym', 'Barra sobre el medio del pie. Pecho arriba, espalda neutra, y empuja el suelo con las piernas. La barra sube pegada al cuerpo.'],
  ['db-rdl', 'Peso muerto rumano con mancuernas', 'Isquiotibiales y glúteos', 'hinge', 'db', 'Mancuernas frente a los muslos. Cadera hacia atrás, espalda recta, y baja hasta la mitad de las canillas.'],
  ['single-leg-rdl', 'Peso muerto a una pierna', 'Isquiotibiales y glúteos', 'hinge', 'bw', 'Apóyate en una pierna e inclina el torso mientras la otra pierna sube hacia atrás. Mantén la cadera cuadrada al suelo.'],
  ['good-morning-bw', 'Buenos días sin peso', 'Isquiotibiales y espalda baja', 'hinge', 'bw', 'Manos detrás de la cabeza. Lleva la cadera hacia atrás inclinando el torso con la espalda recta, y vuelve apretando los glúteos.'],

  // Zancadas
  ['db-lunge', 'Zancadas con mancuernas', 'Cuádriceps y glúteos', 'lunge', 'db', 'Da un paso largo y baja hasta que ambas rodillas formen 90°. Empuja con el talón de adelante para volver.'],
  ['bulgarian', 'Sentadilla búlgara', 'Cuádriceps y glúteos', 'lunge', 'bw', 'Pie de atrás apoyado sobre una silla o banco. Baja recto con el peso en la pierna de adelante. Suma mancuernas si te resulta fácil.'],
  ['bw-lunge', 'Zancadas alternadas', 'Cuádriceps y glúteos', 'lunge', 'bw', 'Alterna las piernas dando pasos largos. Torso erguido y rodilla de adelante alineada con el pie.'],
  ['step-up', 'Subidas al cajón', 'Cuádriceps y glúteos', 'lunge', 'bw', 'Sube a un cajón o silla firme empujando solo con la pierna de arriba. Baja controlado.'],

  // Empuje horizontal
  ['bench-press', 'Press de banca con barra', 'Pecho, hombros y tríceps', 'hpush', 'gym', 'Escápulas juntas y pies firmes en el suelo. Baja la barra al pecho medio y empuja hasta extender los brazos.'],
  ['machine-chest-press', 'Press de pecho en máquina', 'Pecho', 'hpush', 'gym', 'Ajusta el asiento para que las manijas queden a la altura del pecho. Empuja sin despegar la espalda del respaldo.'],
  ['db-bench', 'Press con mancuernas', 'Pecho, hombros y tríceps', 'hpush', 'db', 'Acostado en un banco (o en el suelo). Baja las mancuernas a los lados del pecho y empuja hasta juntarlas arriba.'],
  ['incline-db-press', 'Press inclinado con mancuernas', 'Pecho superior', 'hpush', 'db', 'Banco inclinado a 30–45°. Baja las mancuernas a la altura de la clavícula y empuja hacia arriba.'],
  ['push-up', 'Flexiones de brazos', 'Pecho, hombros y tríceps', 'hpush', 'bw', 'Cuerpo en línea recta de la cabeza a los talones. Baja el pecho hasta casi tocar el suelo. Si cuesta, apoya las rodillas.'],
  ['decline-push-up', 'Flexiones con pies elevados', 'Pecho superior y hombros', 'hpush', 'bw', 'Pies sobre una silla y manos en el suelo. Mantén el abdomen apretado para no arquear la espalda.'],

  // Empuje vertical
  ['ohp', 'Press militar con barra', 'Hombros y tríceps', 'vpush', 'gym', 'De pie, barra a la altura de la clavícula. Empuja sobre la cabeza apretando glúteos y abdomen para no arquear la espalda.'],
  ['db-shoulder-press', 'Press de hombros con mancuernas', 'Hombros y tríceps', 'vpush', 'db', 'Sentado o de pie, mancuernas a la altura de las orejas. Empuja hacia arriba sin chocar las mancuernas.'],
  ['arnold-press', 'Press Arnold', 'Hombros', 'vpush', 'db', 'Parte con las palmas hacia ti y gira las muñecas mientras empujas hacia arriba.'],
  ['pike-push-up', 'Flexiones en pica', 'Hombros y tríceps', 'vpush', 'bw', 'Cadera arriba formando una V invertida. Baja la cabeza hacia el suelo entre las manos y empuja.'],

  // Tirón horizontal
  ['barbell-row', 'Remo con barra', 'Espalda media y dorsales', 'hpull', 'gym', 'Torso inclinado a unos 45°, espalda recta. Lleva la barra al ombligo juntando las escápulas.'],
  ['cable-row', 'Remo sentado en polea', 'Espalda media', 'hpull', 'gym', 'Pecho arriba. Tira del agarre hacia el abdomen y aprieta las escápulas un segundo.'],
  ['db-row', 'Remo con mancuerna a una mano', 'Dorsales y espalda media', 'hpull', 'db', 'Apoya una mano y una rodilla en un banco o silla. Lleva la mancuerna hacia la cadera con el codo pegado al cuerpo.'],
  ['db-bent-row', 'Remo inclinado con mancuernas', 'Espalda media', 'hpull', 'db', 'Torso inclinado y espalda recta. Sube ambas mancuernas hacia las costillas.'],
  ['inverted-row', 'Remo invertido', 'Espalda media y bíceps', 'hpull', 'bw', 'Cuélgate bajo una mesa firme o barra baja con el cuerpo recto y tira del pecho hacia el borde.'],
  ['superman-pull', 'Superman con jalón', 'Espalda baja y dorsales', 'hpull', 'bw', 'Boca abajo, levanta pecho y brazos, y lleva los codos hacia las costillas como si jalaras una barra.'],

  // Tirón vertical
  ['lat-pulldown', 'Jalón al pecho', 'Dorsales', 'vpull', 'gym', 'Agarre un poco más ancho que los hombros. Lleva la barra a la clavícula sacando pecho, sin balancearte.'],
  ['pull-up', 'Dominadas', 'Dorsales y bíceps', 'vpull', 'gym', 'Cuélgate con los brazos extendidos y sube hasta pasar el mentón sobre la barra. Usa banda o máquina asistida si lo necesitas.'],
  ['db-pullover', 'Pullover con mancuerna', 'Dorsales y pecho', 'vpull', 'db', 'Acostado, lleva una mancuerna desde detrás de la cabeza hasta sobre el pecho con los codos apenas flexionados.'],
  ['towel-row', 'Remo con toalla en puerta', 'Dorsales y bíceps', 'vpull', 'bw', 'Pasa una toalla por la manilla de una puerta firme, inclínate hacia atrás con el cuerpo recto y tira hacia ti.'],
  ['prone-y-raise', 'Elevaciones en Y boca abajo', 'Dorsales y trapecio', 'vpull', 'bw', 'Boca abajo con los brazos en Y. Levántalos del suelo apretando la espalda y baja lento.'],

  // Aislados de pierna
  ['leg-extension', 'Extensión de cuádriceps', 'Cuádriceps', 'quad_iso', 'gym', 'Extiende las rodillas por completo, aprieta un segundo arriba y baja lento.'],
  ['db-step-up', 'Subidas al cajón con mancuernas', 'Cuádriceps', 'quad_iso', 'db', 'Con una mancuerna en cada mano, sube al cajón empujando solo con la pierna de arriba.'],
  ['wall-sit', 'Sentadilla isométrica en pared', 'Cuádriceps', 'quad_iso', 'bw', 'Espalda contra la pared y rodillas a 90°. Aguanta la posición sin apoyar las manos en las piernas.', true],
  ['leg-curl', 'Curl femoral', 'Isquiotibiales', 'ham_iso', 'gym', 'Flexiona las rodillas llevando el rodillo hacia los glúteos, sin levantar la cadera.'],
  ['db-leg-curl', 'Curl femoral con mancuerna', 'Isquiotibiales', 'ham_iso', 'db', 'Boca abajo, sujeta una mancuerna entre los pies y flexiona las rodillas con control.'],
  ['slider-curl', 'Curl femoral deslizante', 'Isquiotibiales', 'ham_iso', 'bw', 'Boca arriba con los talones sobre una toalla en piso liso. Levanta la cadera y arrastra los talones hacia ti.'],
  ['hip-thrust', 'Hip thrust con barra', 'Glúteos', 'glute', 'gym', 'Espalda alta apoyada en un banco y barra sobre la cadera. Sube hasta alinear rodillas, cadera y hombros, apretando los glúteos.'],
  ['db-hip-thrust', 'Hip thrust con mancuerna', 'Glúteos', 'glute', 'db', 'Igual que con barra, con una mancuerna apoyada sobre la cadera.'],
  ['glute-bridge', 'Puente de glúteos', 'Glúteos', 'glute', 'bw', 'Boca arriba, pies cerca de los glúteos. Sube la cadera y aprieta 2 segundos arriba. Hazlo a una pierna para más dificultad.'],
  ['machine-calf', 'Elevación de talones en máquina', 'Pantorrillas', 'calf', 'gym', 'Rango completo: baja bien el talón, sube lo más alto posible y pausa arriba.'],
  ['db-calf', 'Elevación de talones con mancuernas', 'Pantorrillas', 'calf', 'db', 'De pie sobre un escalón con una mancuerna en cada mano. Sube y baja con rango completo.'],
  ['bw-calf', 'Elevación de talones a una pierna', 'Pantorrillas', 'calf', 'bw', 'Sobre un escalón, a una pierna, apoyando una mano en la pared para el equilibrio.'],

  // Aislados de torso
  ['cable-fly', 'Aperturas en polea', 'Pecho', 'chest_iso', 'gym', 'Codos apenas flexionados. Junta las manos frente al pecho como abrazando un árbol.'],
  ['db-fly', 'Aperturas con mancuernas', 'Pecho', 'chest_iso', 'db', 'Acostado, abre los brazos hasta sentir el estiramiento en el pecho y vuelve a juntarlos arriba.'],
  ['wide-push-up', 'Flexiones abiertas', 'Pecho', 'chest_iso', 'bw', 'Manos más anchas que los hombros para dar más trabajo al pecho.'],
  ['cable-lateral', 'Elevaciones laterales en polea', 'Hombros', 'delt_lat', 'gym', 'Polea baja. Sube el brazo hacia el lado hasta la altura del hombro, sin impulso.'],
  ['db-lateral', 'Elevaciones laterales', 'Hombros', 'delt_lat', 'db', 'Sube las mancuernas hacia los lados hasta la altura de los hombros, con los codos apenas flexionados.'],
  ['shoulder-taps', 'Plancha con toque de hombros', 'Hombros y abdomen', 'delt_lat', 'bw', 'En plancha alta, toca un hombro con la mano contraria sin girar la cadera.'],
  ['face-pull', 'Face pull', 'Hombro posterior', 'delt_rear', 'gym', 'Polea alta con cuerda. Tira hacia la cara separando las manos y llevando los codos arriba.'],
  ['db-reverse-fly', 'Pájaros con mancuernas', 'Hombro posterior', 'delt_rear', 'db', 'Torso inclinado. Abre los brazos hacia los lados juntando las escápulas.'],
  ['ytw', 'Y-T-W boca abajo', 'Hombro posterior y trapecio', 'delt_rear', 'bw', 'Boca abajo, levanta los brazos formando una Y, luego una T y luego una W. Eso es una repetición.'],
  ['barbell-curl', 'Curl de bíceps con barra', 'Bíceps', 'biceps', 'gym', 'Codos pegados al cuerpo. Sube la barra sin balancear el torso y baja lento.'],
  ['cable-curl', 'Curl de bíceps en polea', 'Bíceps', 'biceps', 'gym', 'Polea baja. Mantén los codos quietos y aprieta arriba.'],
  ['db-curl', 'Curl alterno con mancuernas', 'Bíceps', 'biceps', 'db', 'Alterna los brazos girando la palma hacia arriba al subir.'],
  ['hammer-curl', 'Curl martillo', 'Bíceps y antebrazo', 'biceps', 'db', 'Palmas enfrentadas durante todo el movimiento.'],
  ['backpack-curl', 'Curl con mochila', 'Bíceps', 'biceps', 'bw', 'Carga una mochila con libros o botellas y úsala como peso para el curl.'],
  ['chin-up-hold', 'Curl isométrico con toalla', 'Bíceps', 'biceps', 'bw', 'Pisa una toalla y tira de ella con los codos a 90°, aguantando la tensión máxima.', true],
  ['triceps-pushdown', 'Extensión de tríceps en polea', 'Tríceps', 'triceps', 'gym', 'Codos pegados al cuerpo. Extiende hacia abajo por completo y vuelve lento.'],
  ['skullcrusher', 'Press francés', 'Tríceps', 'triceps', 'gym', 'Acostado, baja la barra hacia la frente doblando solo los codos y extiende.'],
  ['db-overhead-ext', 'Extensión de tríceps sobre la cabeza', 'Tríceps', 'triceps', 'db', 'Sostén una mancuerna con ambas manos detrás de la cabeza y extiende los codos hacia arriba.'],
  ['db-kickback', 'Patada de tríceps', 'Tríceps', 'triceps', 'db', 'Torso inclinado y codo fijo junto al cuerpo. Extiende el brazo hacia atrás.'],
  ['bench-dip', 'Fondos en silla', 'Tríceps', 'triceps', 'bw', 'Manos en el borde de una silla firme. Baja flexionando los codos hacia atrás y empuja.'],
  ['diamond-push-up', 'Flexiones diamante', 'Tríceps y pecho', 'triceps', 'bw', 'Manos juntas bajo el pecho formando un rombo. Codos cerca del cuerpo.'],

  // Zona media
  ['plank', 'Plancha', 'Abdomen', 'core', 'bw', 'Antebrazos en el suelo y cuerpo en línea recta. Aprieta abdomen y glúteos sin dejar caer la cadera.', true],
  ['crunch', 'Crunch abdominal', 'Abdomen', 'core', 'bw', 'Despega solo los hombros del suelo, exhalando al subir. No tires del cuello.'],
  ['leg-raise', 'Elevación de piernas', 'Abdomen inferior', 'core', 'bw', 'Boca arriba, sube las piernas rectas y bájalas lento sin despegar la zona lumbar.'],
  ['side-plank', 'Plancha lateral', 'Oblicuos', 'core', 'bw', 'Apoyado en un antebrazo con el cuerpo de lado y recto. Cambia de lado al terminar el tiempo.', true],
  ['dead-bug', 'Bicho muerto', 'Abdomen profundo', 'core', 'bw', 'Boca arriba, extiende brazo y pierna contrarios manteniendo la zona lumbar pegada al suelo.'],
  ['mountain-climber', 'Escaladores', 'Abdomen y cardio', 'core', 'bw', 'En plancha alta, lleva las rodillas al pecho alternando a ritmo rápido.', true],
  ['cable-crunch', 'Crunch en polea', 'Abdomen', 'core', 'gym', 'De rodillas frente a la polea alta. Flexiona el tronco llevando los codos hacia las rodillas.'],
];

export const EXERCISES: Exercise[] = ROWS.map(([id, name, muscle, pattern, eq, tips, timed]) => ({ id, name, muscle, pattern, eq, tips, timed }));

const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

export function getExercise(id: string): Exercise {
  return BY_ID.get(id) ?? { id, name: 'Ejercicio', muscle: '', pattern: 'core', eq: 'bw', tips: '' };
}

/** Búsqueda de videos de técnica en YouTube (en el teléfono se abre en la app de YouTube). */
export function videoUrl(exerciseName: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`cómo hacer ${exerciseName} técnica correcta`)}`;
}

/** Búsqueda de imágenes de referencia del ejercicio. */
export function imagesUrl(exerciseName: string): string {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${exerciseName} ejercicio técnica`)}`;
}

export const MUSCLE_GROUPS = ['Pecho', 'Espalda', 'Hombros', 'Bíceps', 'Tríceps', 'Piernas', 'Glúteos', 'Abdomen'];

const ALLOWED: Record<Equipment, Eq[]> = {
  gym: ['gym', 'db', 'bw'],
  dumbbells: ['db', 'bw'],
  bodyweight: ['bw'],
};

/** Ejercicios de un patrón disponibles con el equipamiento, priorizando el equipamiento más completo. */
export function candidates(pattern: Pattern, equipment: Equipment): Exercise[] {
  const order = ALLOWED[equipment];
  return EXERCISES.filter((e) => e.pattern === pattern && order.includes(e.eq)).sort((a, b) => order.indexOf(a.eq) - order.indexOf(b.eq));
}

/** Alternativas para reemplazar un ejercicio por otro equivalente. */
export function alternatives(exerciseId: string, equipment: Equipment): Exercise[] {
  const ex = getExercise(exerciseId);
  return candidates(ex.pattern, equipment).filter((e) => e.id !== exerciseId);
}
