// apps/web/lib/images/optimizeCover.ts · optimización de portada EN EL CLIENTE
// antes del upload. Objetivo: aceptar originales grandes y dejarlos en alta calidad
// visual por debajo de 5 MB (NO "sin pérdida"). El servidor NUNCA confía en esto:
// revalida magic bytes + decode + reencoda. Acá es UX + ahorro de banda.
//
// Reglas:
//  · Entrada máx 25 MB; sólo JPEG/PNG/WebP; rechaza dimensiones/píxeles peligrosos.
//  · ≤5 MB y válida → se CONSERVA tal cual (el server recorta a 1600×900).
//  · >5 MB → decode (createImageBitmap, auto-orientación) → cover 1600×900 → WebP,
//    escalera de calidad 0.92→0.78; el primero que quede <5 MB gana. Si ninguno
//    baja de 5 MB → error claro.
//  · Procesa con OffscreenCanvas si está disponible (fuera del árbol DOM) y cede
//    control al navegador entre intentos para no congelar móviles. (Un Worker
//    dedicado es la mejora siguiente; el seam `CodecFactory` lo hace drop-in.)
//
// El codec es INYECTABLE (`CodecFactory`) → la lógica de validación + escalera es
// testeable sin canvas real.

export const MAX_INPUT_BYTES = 25 * 1024 * 1024; // 25 MB
export const TARGET_BYTES = 5 * 1024 * 1024; // 5 MB
export const COVER_W = 1600;
export const COVER_H = 900;
export const MAX_PIXELS = 40_000_000; // ~40 MP: por encima, riesgo de congelar el móvil
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const QUALITY_LADDER = [0.92, 0.88, 0.84, 0.8, 0.78];

export type OptimizeErrorCode =
  | 'bad_type' | 'too_large_input' | 'dangerous_dimensions' | 'decode_failed' | 'cannot_reach_target';

export class OptimizeError extends Error {
  constructor(public readonly code: OptimizeErrorCode, message: string) {
    super(message);
    this.name = 'OptimizeError';
  }
}

export interface OptimizeResult {
  blob: Blob;
  originalSize: number;
  finalSize: number;
  optimized: boolean; // true = reencodada; false = original conservado (≤5MB)
  width: number;
  height: number;
}

// Seam inyectable: carga la imagen (dimensiones naturales) y renderiza cover
// 1600×900 a WebP con la calidad pedida.
export interface CoverCodec {
  readonly width: number;
  readonly height: number;
  render(quality: number): Promise<Blob>;
  dispose(): void;
}
export type CodecFactory = (file: Blob) => Promise<CoverCodec>;

export function validateInput(file: { type: string; size: number }): OptimizeError | null {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return new OptimizeError('bad_type', 'Formato no permitido. Usá JPEG, PNG o WebP.');
  }
  if (file.size > MAX_INPUT_BYTES) {
    return new OptimizeError('too_large_input', 'La imagen supera el máximo de 25 MB.');
  }
  return null;
}

const yieldToBrowser = (): Promise<void> =>
  new Promise((r) => {
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => r());
    else setTimeout(r, 0);
  });

export async function optimizeCover(file: File, makeCodec: CodecFactory = browserCoverCodec): Promise<OptimizeResult> {
  const invalid = validateInput(file);
  if (invalid) throw invalid;

  const codec = await makeCodec(file);
  try {
    if (codec.width * codec.height > MAX_PIXELS) {
      throw new OptimizeError('dangerous_dimensions', 'La imagen tiene dimensiones demasiado grandes.');
    }
    // ≤5 MB y válida → conservar original (el server recorta a 1600×900).
    if (file.size <= TARGET_BYTES) {
      return { blob: file, originalSize: file.size, finalSize: file.size, optimized: false, width: codec.width, height: codec.height };
    }
    // >5 MB → escalera de calidad; el primero <5 MB gana.
    for (let i = 0; i < QUALITY_LADDER.length; i++) {
      const blob = await codec.render(QUALITY_LADDER[i]!);
      if (blob.size < TARGET_BYTES) {
        return { blob, originalSize: file.size, finalSize: blob.size, optimized: true, width: COVER_W, height: COVER_H };
      }
      if (i < QUALITY_LADDER.length - 1) await yieldToBrowser();
    }
    throw new OptimizeError('cannot_reach_target', 'No pudimos optimizar la imagen por debajo de 5 MB. Probá con una imagen más liviana.');
  } finally {
    codec.dispose();
  }
}

// Codec real del navegador. createImageBitmap auto-orienta por EXIF; OffscreenCanvas
// (si existe) mantiene el canvas fuera del DOM.
const browserCoverCodec: CodecFactory = async (file) => {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  } catch {
    throw new OptimizeError('decode_failed', 'No se pudo procesar la imagen.');
  }
  const { width, height } = bitmap;
  return {
    width,
    height,
    async render(quality: number): Promise<Blob> {
      // cover-crop centrado a COVER_W×COVER_H.
      const scale = Math.max(COVER_W / width, COVER_H / height);
      const dw = width * scale;
      const dh = height * scale;
      const dx = (COVER_W - dw) / 2;
      const dy = (COVER_H - dh) / 2;
      if (typeof OffscreenCanvas !== 'undefined') {
        const canvas = new OffscreenCanvas(COVER_W, COVER_H);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new OptimizeError('decode_failed', 'No se pudo procesar la imagen.');
        ctx.drawImage(bitmap, dx, dy, dw, dh);
        return canvas.convertToBlob({ type: 'image/webp', quality });
      }
      const canvas = document.createElement('canvas');
      canvas.width = COVER_W;
      canvas.height = COVER_H;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new OptimizeError('decode_failed', 'No se pudo procesar la imagen.');
      ctx.drawImage(bitmap, dx, dy, dw, dh);
      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new OptimizeError('decode_failed', 'No se pudo procesar la imagen.'))), 'image/webp', quality);
      });
    },
    dispose() {
      bitmap.close?.();
    },
  };
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
