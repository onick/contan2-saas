#!/usr/bin/env node
// scripts/landing/budget.mjs · presupuesto de la landing (Node puro, sin deps).
//
//   node apps/web/scripts/landing/budget.mjs --url http://localhost:3100/ --host contan2.com
//
// Descarga el HTML (con el header Host indicado), sus CSS/JS/fuentes y verifica
// el presupuesto del plan 2026-10-16 §4-E. Exit 1 si algo lo viola.
// Las funciones puras (extract*/evaluateBudget) se testean en budget.test.ts.

import { gzipSync } from 'node:zlib';
import http from 'node:http';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

export const LIMITS = {
  htmlBytes: 60 * 1024,
  htmlGzBytes: 20 * 1024,
  jsGzBytes: 100 * 1024,
  cssGzBytes: 12 * 1024,
  imagePreloads: 1,
  fontPreloads: 2,
  fontPreloadBytes: 80 * 1024,
};

export const gzSize = (buf) => gzipSync(buf).length;

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
};
const tagsOf = (html, name) => html.match(new RegExp(`<${name}\\b[^>]*>`, 'gi')) ?? [];

/** <script src="..."> externos. */
export function extractScriptSrcs(html) {
  return tagsOf(html, 'script').map((t) => attr(t, 'src')).filter(Boolean);
}

/** Contenido de <script> inline ejecutable (excluye ld+json y otros tipos de datos). */
export function extractInlineScripts(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] ?? '';
    if (/\ssrc\s*=/i.test(attrs)) continue;
    const type = attr(`<script${attrs}>`, 'type');
    if (type && !/^(module|text\/javascript|application\/javascript)$/i.test(type)) continue;
    if ((m[2] ?? '').trim()) out.push(m[2]);
  }
  return out;
}

export function extractStylesheetHrefs(html) {
  return tagsOf(html, 'link')
    .filter((t) => /stylesheet/i.test(attr(t, 'rel') ?? ''))
    .map((t) => attr(t, 'href'))
    .filter(Boolean);
}

/** <link rel="preload"> → [{ as, href }]. */
export function extractPreloads(html) {
  return tagsOf(html, 'link')
    .filter((t) => /(^|\s)preload(\s|$)/i.test(attr(t, 'rel') ?? ''))
    .map((t) => ({ as: (attr(t, 'as') ?? '').toLowerCase(), href: attr(t, 'href') ?? '' }));
}

/** <img> a los que les falta width o height (evita CLS). */
export function imgsMissingDimensions(html) {
  return tagsOf(html, 'img').filter((t) => attr(t, 'width') === null || attr(t, 'height') === null);
}

export function countH1(html) {
  return (html.match(/<h1\b/gi) ?? []).length;
}

export function seoPresence(html) {
  return {
    langEs: /<html\b[^>]*\slang\s*=\s*["']?es(?:-[A-Za-z]+)?["'\s>]/i.test(html),
    canonical: tagsOf(html, 'link').some((t) => /canonical/i.test(attr(t, 'rel') ?? '') && !!attr(t, 'href')),
    ogImage: tagsOf(html, 'meta').some((t) => attr(t, 'property') === 'og:image' && !!attr(t, 'content')),
    ldJson: /<script\b[^>]*type\s*=\s*["']application\/ld\+json["']/i.test(html),
  };
}

/**
 * Evalúa el presupuesto. `input`:
 *   html (string), headers (obj en minúsculas),
 *   assets: { js: Buffer[], css: Buffer[], fonts: number[] (bytes de woff2 precargados) }
 * Devuelve la lista de violaciones (vacía = OK) y las métricas medidas.
 */
export function evaluateBudget(input) {
  const { html, headers = {}, assets = { js: [], css: [], fonts: [] } } = input;
  const violations = [];
  const fail = (m) => violations.push(m);

  const htmlBytes = Buffer.byteLength(html);
  const htmlGz = gzSize(Buffer.from(html));
  if (htmlBytes > LIMITS.htmlBytes) fail(`HTML ${htmlBytes} B > ${LIMITS.htmlBytes} B`);
  if (htmlGz > LIMITS.htmlGzBytes) fail(`HTML gz ${htmlGz} B > ${LIMITS.htmlGzBytes} B`);

  const inlineJs = extractInlineScripts(html).reduce((n, s) => n + gzSize(Buffer.from(s)), 0);
  const jsGz = assets.js.reduce((n, b) => n + gzSize(b), 0) + inlineJs;
  if (jsGz > LIMITS.jsGzBytes) fail(`JS gz ${jsGz} B > ${LIMITS.jsGzBytes} B`);

  const cssGz = assets.css.reduce((n, b) => n + gzSize(b), 0);
  if (cssGz > LIMITS.cssGzBytes) fail(`CSS gz ${cssGz} B > ${LIMITS.cssGzBytes} B`);

  const preloads = extractPreloads(html);
  const imagePreloads = preloads.filter((p) => p.as === 'image').length;
  if (imagePreloads > LIMITS.imagePreloads) fail(`${imagePreloads} preloads de imagen (máx ${LIMITS.imagePreloads})`);

  const fontPreloads = preloads.filter((p) => p.as === 'font').length;
  if (fontPreloads > LIMITS.fontPreloads) fail(`${fontPreloads} fuentes precargadas (máx ${LIMITS.fontPreloads})`);
  const fontBytes = assets.fonts.reduce((n, b) => n + b, 0);
  if (fontBytes > LIMITS.fontPreloadBytes) fail(`fuentes precargadas ${fontBytes} B > ${LIMITS.fontPreloadBytes} B`);

  const bad = imgsMissingDimensions(html);
  if (bad.length) fail(`${bad.length} <img> sin width/height: ${bad[0]}`);

  const h1 = countH1(html);
  if (h1 !== 1) fail(`se esperaba 1 <h1>, hay ${h1}`);

  const seo = seoPresence(html);
  if (!seo.langEs) fail('falta <html lang="es">');
  if (!seo.canonical) fail('falta <link rel="canonical">');
  if (!seo.ogImage) fail('falta og:image');
  if (!seo.ldJson) fail('falta JSON-LD (application/ld+json)');

  const cc = headers['cache-control'];
  if (!cc) fail('falta cache-control');
  else if (/no-store/i.test(cc)) fail(`cache-control contiene no-store: ${cc}`);

  return {
    ok: violations.length === 0,
    violations,
    metrics: { htmlBytes, htmlGz, jsGz, cssGz, imagePreloads, fontPreloads, fontBytes, h1, cacheControl: cc ?? null },
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function get(urlStr, host) {
  const u = new URL(urlStr);
  const lib = u.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      u,
      { method: 'GET', headers: { host: host ?? u.host, 'accept-encoding': 'identity' } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

export async function run(argv) {
  const { url, host } = parseArgs(argv);
  if (!url) {
    console.error('uso: budget.mjs --url <url> [--host <Host header>]');
    return 2;
  }
  const page = await get(url, host);
  if (page.status !== 200) {
    console.error(`GET ${url} → ${page.status}`);
    return 1;
  }
  const html = page.body.toString('utf8');
  const abs = (p) => new URL(p, url).toString();
  const fetchAll = (list) => Promise.all(list.map((p) => get(abs(p), host).then((r) => r.body)));

  const js = await fetchAll(extractScriptSrcs(html));
  const css = await fetchAll(extractStylesheetHrefs(html));
  const fontHrefs = extractPreloads(html).filter((p) => p.as === 'font').map((p) => p.href);
  const fonts = (await fetchAll(fontHrefs)).map((b) => b.length);

  const result = evaluateBudget({ html, headers: page.headers, assets: { js, css, fonts } });
  console.log(JSON.stringify(result.metrics, null, 2));
  if (result.ok) {
    console.log('PRESUPUESTO OK');
    return 0;
  }
  for (const v of result.violations) console.error(`✗ ${v}`);
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run(process.argv.slice(2)).then((code) => process.exit(code), (e) => {
    console.error(e);
    process.exit(1);
  });
}
