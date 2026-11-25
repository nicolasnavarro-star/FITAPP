# Kaizen Health & Fitness

App personal para Android: contador de calorías con IA, seguimiento de progreso, rutinas de entrenamiento y registro de salidas a la montaña con GPS. Gratuita, sin cuentas ni servidores: todos los datos viven en tu teléfono.

## Qué hace

- **Diario de comidas** con calorías y macros (proteínas, carbohidratos, grasas) por desayuno, almuerzo, cena y colaciones, además de registro de agua.
- **Varias formas de registrar**: buscador por nombre que consulta a la vez la base local (funciona sin conexión), los productos envasados de [Open Food Facts](https://world.openfoodfacts.org) y, si quieres, la IA para platos o productos que no aparecen; **escáner de código de barras** con los datos de la etiqueta (incluye azúcares, grasas saturadas, fibra y sodio cuando existen); **foto con IA** del plato; y añadido rápido de calorías.
- **Productos que no están en la base**: si el código escaneado no aparece en Open Food Facts, la app puede buscar su tabla nutricional en internet con la búsqueda web de Claude (muestra la fuente y pide compararla con el envase) o leerla de una foto de la etiqueta. En ambos casos el producto queda guardado con su código.
- **Lectura de etiquetas**: si un producto no está en la base, una foto de su tabla nutricional completa los valores exactos y queda asociado a su código de barras para la próxima vez.
- **Metas a tu medida**: definición, mantener o ganar músculo, con calorías y macros calculados según tu peso, altura, edad y actividad (fórmula Mifflin-St Jeor). También puedes fijar metas propias.
- **Progreso**: registro de peso, gráfico con línea de meta, fecha estimada para llegar al objetivo, IMC, calorías de la semana y racha de días.
- **Rutinas**: genera una rutina semanal de cuerpo completo, torso/pierna o empuje/tirón/pierna según tus días disponibles, equipamiento (gimnasio, mancuernas o peso corporal) y nivel. Registra series, peso y repeticiones con temporizador de descanso.
- **Equipo y ejercicios**: saca una foto a una máquina, mancuernas o cualquier implemento y la IA lo identifica y sugiere ejercicios para el grupo muscular que elijas, con pasos, consejo de técnica y enlaces a videos e imágenes de referencia. Con Gemini también puede generar una ilustración del ejercicio (Google suele reservar los modelos de imagen para cuentas con facturación activada).
- **Montaña**: graba cerros, trail, caminatas o salidas en bici con GPS (también con la pantalla apagada): recorrido en el mapa (relieve propio que funciona sin conexión, calles, topográfico o satelital), distancia, desnivel, altitud, ritmo, velocidad de ascenso y parciales por kilómetro. Traza rutas tocando el mapa (siguiendo senderos o en línea recta) con su perfil de altitud y tiempo estimado, importa y exporta GPX (compatible con Strava, Suunto o Garmin) y consulta el clima de tu zona con avisos de viento, UV y lluvia.
- **Respaldo**: exporta e importa todo tu historial, incluidos los recorridos, en un archivo.

## Instalar en tu teléfono

1. En el teléfono, abre la página **Releases** de este repositorio y descarga el archivo `Kaizen-x.y.z.apk` más reciente.
2. Abre el archivo. Android pedirá permiso para «instalar apps desconocidas» desde el navegador: acéptalo.
3. Para actualizar, instala un APK más nuevo encima: tus datos se conservan.

Cada cambio que se sube al repositorio compila un APK nuevo automáticamente (pestaña **Actions**) y lo publica en Releases.

## Activar la foto con IA

La app necesita una clave personal de un servicio de IA. Se configura una vez en **Perfil → Inteligencia artificial**:

- **Google Gemini (gratis)**: crea una clave en <https://aistudio.google.com/apikey>. El nivel gratuito alcanza para uso personal.
- **Claude (de pago por uso)**: crea una clave en <https://platform.claude.com/settings/keys>.

La clave se guarda solo en el teléfono y las fotos van directo del teléfono al proveedor elegido.

## Desarrollo

Hecha con React, TypeScript y Vite, empaquetada para Android con Capacitor.

```bash
npm install
npm run dev          # servidor de desarrollo en el navegador
npm test             # pruebas unitarias
npm run build        # compila la app web en dist/
npm run android:sync # copia la app web al proyecto Android
cd android && ./gradlew assembleRelease   # requiere el SDK de Android y JDK 21
```

Estructura principal:

- `src/lib/`: lógica sin interfaz (cálculo de metas, base de alimentos, Open Food Facts, IA, ejercicios, generador de rutinas y el módulo de montaña: cálculo de recorridos, GPS, clima y trazado de rutas).
- `src/screens/`: pantallas de la app.
- `src/store.ts`: estado y guardado local.
- `android/`: proyecto nativo generado por Capacitor.
- `.github/workflows/android.yml`: compilación y publicación del APK.

### Sobre la firma del APK

Android solo permite actualizar una app si el APK nuevo está firmado con la misma clave que el instalado. Para que eso funcione sin configurar nada, la clave de firma (`android/keystore/healty-sideload.jks`) está incluida en el repositorio con una contraseña conocida, igual que una clave de depuración. Sirve para instalación personal, no para publicar en Google Play.

Mientras el repositorio sea público, cualquiera podría firmar un APK con esa misma clave, así que instala solo los APK de tus propios Releases. Si prefieres una clave privada, define las variables `KEYSTORE_FILE`, `KEYSTORE_PASSWORD`, `KEY_ALIAS` y `KEY_PASSWORD` en la compilación (cambiar de clave obliga a desinstalar la app una vez; haz un respaldo antes).

## Servicios externos del módulo de montaña

Todos son gratuitos y no requieren clave: clima y modelo de terreno de [Open-Meteo](https://open-meteo.com), trazado por senderos de [BRouter](https://brouter.de), y capas de mapa en línea de OpenStreetMap, OpenTopoMap y Esri.

### Mapas sin conexión

En **Montaña → Mapas sin conexión** se descarga una zona para usarla sin señal. La app no guarda imágenes de mapas de terceros (los servidores gratuitos de OpenStreetMap no permiten descargarlas en bloque y Google Maps tampoco): arma su propio mapa con fuentes que sí se pueden guardar.

- **Relieve**: teselas de altitud del conjunto abierto [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/), con las que el teléfono dibuja el sombreado de laderas y las curvas de nivel, y mide el desnivel sin conexión.
- **Senderos, caminos, ríos y cumbres**: datos de OpenStreetMap (licencia ODbL) obtenidos con la API Overpass.

Sin señal el mapa abre solo la capa «Relieve (sin conexión)». Las capas en línea guardan además lo que ya se vio.

## Aviso

Los valores nutricionales y las metas son estimaciones, y las rutinas son orientaciones generales. En la montaña no dependas solo del teléfono: el GPS, el clima y las rutas pueden fallar o ser inexactos. La app no reemplaza el consejo de profesionales de la salud o del deporte.
