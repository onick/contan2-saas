// =============================================================================
// pdfRenderer.js · Puppeteer singleton para render de PDFs.
// Reusa una única instancia de Chromium para evitar costos de arranque
// (~500ms por launch). El navegador se mantiene caliente entre requests.
// =============================================================================

import puppeteer from 'puppeteer-core';

const EXECUTABLE = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';

let _browser = null;
let _launching = null;

async function getBrowser() {
  if (_browser && _browser.connected) return _browser;
  if (_launching) return _launching;
  _launching = puppeteer.launch({
    executablePath: EXECUTABLE,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--disable-extensions',
    ],
  }).then(b => {
    _browser = b;
    b.on('disconnected', () => { _browser = null; });
    return b;
  }).finally(() => { _launching = null; });
  return _launching;
}

/**
 * Renderiza un HTML completo a PDF (Buffer).
 * @param {string} html — HTML completo (con <!DOCTYPE> y <head>).
 * @param {object} opts — opciones de Puppeteer.pdf()
 */
export async function renderHtmlToPdf(html, opts = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20_000 });
    // Asegura que las webfonts cargaron antes de imprimir.
    await page.evaluateHandle('document.fonts.ready');
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '12mm', right: '12mm', bottom: '14mm', left: '12mm' },
      ...opts,
    });
  } finally {
    await page.close().catch(() => {});
  }
}

export async function shutdownPdfRenderer() {
  if (_browser) {
    await _browser.close().catch(() => {});
    _browser = null;
  }
}
