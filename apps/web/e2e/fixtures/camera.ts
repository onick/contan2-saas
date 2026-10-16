// fixtures/camera.ts · camara simulada para el escaner (QR generado en Node con `qrcode`).
// getUserMedia se reemplaza por canvas.captureStream() que dibuja el QR sobre fondo blanco.
import type { BrowserContext, Page } from '@playwright/test';
import QRCode from 'qrcode';

export async function qrDataUrl(code: string): Promise<string> {
  return QRCode.toDataURL(code, { margin: 4, width: 480, errorCorrectionLevel: 'M' });
}

/** Instala la camara falsa que muestra `code`. Llamar ANTES de page.goto. */
export async function installFakeCamera(page: Page, code: string): Promise<void> {
  const dataUrl = await qrDataUrl(code);
  await page.addInitScript((src: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.src = src;
    const draw = () => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 640, 480);
      if (img.complete) ctx.drawImage(img, 80, 0, 480, 480);
      requestAnimationFrame(draw);
    };
    draw();
    const stream = (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(15);
    const md = navigator.mediaDevices ?? ({} as MediaDevices);
    Object.defineProperty(navigator, 'mediaDevices', { value: md, configurable: true });
    md.getUserMedia = async () => stream;
    md.enumerateDevices = async () => [
      { deviceId: 'e2e-cam', kind: 'videoinput', label: 'E2E camera', groupId: 'e2e', toJSON() { return {}; } } as MediaDeviceInfo,
    ];
  }, dataUrl);
}

/** SCN-06: la camara es denegada (NotAllowedError) -> la UI debe ofrecer entrada manual. */
export async function denyCamera(page: Page, context?: BrowserContext): Promise<void> {
  await (context ?? page.context()).grantPermissions([]);
  await page.addInitScript(() => {
    const md = navigator.mediaDevices ?? ({} as MediaDevices);
    Object.defineProperty(navigator, 'mediaDevices', { value: md, configurable: true });
    md.getUserMedia = async () => {
      throw new DOMException('Permission denied', 'NotAllowedError');
    };
  });
}
