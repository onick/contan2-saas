'use client';

// apps/web/lib/scanner/useQrCamera.ts · cámara + loop jsQR reutilizable.
//
// Extraído del scanner de staff (app/scanner/ScannerClient.tsx) para que la
// consola de check-in admin reuse el MISMO motor de escaneo probado en vez de
// duplicarlo: getUserMedia(facingMode environment) → rAF loop → jsQR sobre un
// canvas offscreen → cooldown entre lecturas. El hook NO sabe de check-in ni de
// formato de código: sólo entrega el texto crudo del QR vía onDecode; validar y
// normalizar es responsabilidad del consumidor (lib/scanner/code.ts).
//
// Sin red, sin estado global. Limpia el stream y el rAF al deshabilitarse o
// desmontar. En entornos sin cámara (jsdom, desktop sin webcam) expone un
// cameraError honesto para que la UI ofrezca la entrada manual de respaldo.

import { useEffect, useRef, useState, type RefObject } from 'react';
import jsQR from 'jsqr';

const DEFAULT_COOLDOWN_MS = 2200;

// Mensajes estables (los testea ScannerClient.test al caer al fallback).
export const CAMERA_UNSUPPORTED = 'Cámara no disponible. Usa la entrada manual.';
export const CAMERA_DENIED = 'No pudimos acceder a la cámara. Revisa los permisos o usa la entrada manual.';

export interface UseQrCameraOptions {
  /** El loop sólo corre mientras sea true (p. ej. pantalla de escaneo / modal abierto). */
  enabled: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Texto crudo del QR detectado. El consumidor normaliza/valida. */
  onDecode: (raw: string) => void;
  /** Anti-repetición entre lecturas de cámara (ms). */
  cooldownMs?: number;
}

export function useQrCamera({
  enabled,
  videoRef,
  canvasRef,
  onDecode,
  cooldownMs = DEFAULT_COOLDOWN_MS,
}: UseQrCameraOptions): { cameraError: string | null } {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const lastScanRef = useRef(0);

  // Guardamos el último onDecode en un ref para NO re-suscribir la cámara cada
  // vez que cambie la identidad del callback (evita reiniciar el stream).
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let stream: MediaStream | null = null;
    let cancelled = false;
    setCameraError(null);

    const handle = (raw: string) => {
      const now = Date.now();
      if (now - lastScanRef.current < cooldownMs) return;
      lastScanRef.current = now;
      onDecodeRef.current(raw);
    };

    function loop() {
      raf = requestAnimationFrame(loop);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      const found = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
      if (found?.data) handle(found.data);
    }

    async function start() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError(CAMERA_UNSUPPORTED);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      } catch {
        setCameraError(CAMERA_DENIED);
        return;
      }
      const video = videoRef.current;
      if (cancelled || !video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => {});
      loop();
    }

    void start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [enabled, videoRef, canvasRef, cooldownMs]);

  return { cameraError };
}
