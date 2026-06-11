// apps/api-v2/src/services/reports/pdf-renderer.ts · Puppeteer singleton para
// render de PDFs (port tipado de v1 pdfRenderer.js). Reusa una única instancia
// de Chromium (launch ~500ms); el ejecutable viene del sistema (la imagen
// Docker instala chromium, igual que la de v1) vía PUPPETEER_EXECUTABLE_PATH.

import puppeteer, { type Browser, type PDFOptions } from 'puppeteer-core';

let _browser: Browser | null = null;
let _launching: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.connected) return _browser;
  if (_launching) return _launching;
  // El ejecutable se resuelve en LAUNCH-time (no al importar el módulo): los
  // tests setean PUPPETEER_EXECUTABLE_PATH después del hoisting de imports.
  const executable = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
  _launching = puppeteer
    .launch({
      executablePath: executable,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote', '--disable-extensions'],
    })
    .then((b) => {
      _browser = b;
      b.on('disconnected', () => { _browser = null; });
      return b;
    })
    .finally(() => { _launching = null; });
  return _launching;
}

export async function renderHtmlToPdf(html: string, opts: PDFOptions = {}): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load', timeout: 20_000 });
    await page.evaluateHandle('document.fonts.ready');
    const out = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '12mm', right: '12mm', bottom: '14mm', left: '12mm' },
      ...opts,
    });
    return Buffer.from(out);
  } finally {
    await page.close().catch(() => {});
  }
}

export async function shutdownPdfRenderer(): Promise<void> {
  if (_browser) {
    await _browser.close().catch(() => {});
    _browser = null;
  }
}
