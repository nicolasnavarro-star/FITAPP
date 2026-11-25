import { BarcodeDetector as ZxingDetector, prepareZXingModule } from 'barcode-detector/ponyfill';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;

export interface Detector {
  detect(source: HTMLVideoElement | ImageBitmap | HTMLCanvasElement): Promise<{ rawValue: string }[]>;
}

interface NativeBarcodeDetector {
  new (opts: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
}

let cached: Promise<Detector> | null = null;

/**
 * Usa el detector nativo del navegador cuando existe (Chrome en Android)
 * y, si no, el lector ZXing en WebAssembly incluido en la app (funciona sin conexión).
 */
export function getDetector(): Promise<Detector> {
  cached ??= (async () => {
    const Native = (globalThis as { BarcodeDetector?: NativeBarcodeDetector }).BarcodeDetector;
    if (Native) {
      try {
        const supported = await Native.getSupportedFormats();
        if (supported.includes('ean_13')) return new Native({ formats: FORMATS.filter((f) => supported.includes(f)) });
      } catch {
        /* se usa el lector incluido */
      }
    }
    prepareZXingModule({
      overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
    });
    return new ZxingDetector({ formats: [...FORMATS] }) as unknown as Detector;
  })();
  return cached;
}

/** Valida el dígito de control de un código EAN-13, EAN-8 o UPC-A. */
export function isValidBarcode(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
