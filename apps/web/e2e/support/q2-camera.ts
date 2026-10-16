// support/q2-camera.ts · camara simulada CONMUTABLE para el escaner.
// fixtures/camera.ts dibuja un QR fijo: con el cooldown de 2200 ms del escaner, un QR siempre visible
// repite el check-in cada 2.2 s (revienta el rate limit de 10/min y pisa el banner OK con "duplicado").
// Aqui el QR se muestra bajo demanda: window.__q2cam.show(dataUrl) / hide().
import type { Page } from '@playwright/test';
import QRCode from 'qrcode';

export async function qrFor(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 4, width: 480, errorCorrectionLevel: 'M' });
}

/** Instala getUserMedia -> canvas.captureStream() en blanco. Llamar ANTES de page.goto. */
export async function installSwitchableCamera(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d')!;
    let img: HTMLImageElement | null = null;
    const draw = () => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 640, 480);
      if (img && img.complete) ctx.drawImage(img, 80, 0, 480, 480);
      requestAnimationFrame(draw);
    };
    draw();
    const stream = (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(15);
    (window as unknown as { __q2cam: unknown }).__q2cam = {
      show(src: string) {
        const i = new Image();
        i.src = src;
        img = i;
      },
      hide() {
        img = null;
      },
    };
    const md = navigator.mediaDevices ?? ({} as MediaDevices);
    Object.defineProperty(navigator, 'mediaDevices', { value: md, configurable: true });
    md.getUserMedia = async () => stream;
    md.enumerateDevices = async () => [
      { deviceId: 'e2e-cam', kind: 'videoinput', label: 'E2E camera', groupId: 'e2e', toJSON() { return {}; } } as MediaDeviceInfo,
    ];
  });
}

export async function showQr(page: Page, text: string): Promise<void> {
  const src = await qrFor(text);
  await page.evaluate((s) => (window as unknown as { __q2cam: { show(s: string): void } }).__q2cam.show(s), src);
}

export async function hideQr(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __q2cam: { hide(): void } }).__q2cam.hide());
}
