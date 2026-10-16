// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  countH1,
  evaluateBudget,
  extractInlineScripts,
  extractPreloads,
  extractScriptSrcs,
  extractStylesheetHrefs,
  imgsMissingDimensions,
  seoPresence,
} from './budget.mjs';

const GOOD = `<!DOCTYPE html><html lang="es"><head>
<link rel="canonical" href="https://contan2.com/"/>
<meta property="og:image" content="https://contan2.com/og.png"/>
<script type="application/ld+json">{"@type":"Organization"}</script>
<link rel="preload" as="image" href="/hero.avif"/>
<link rel="preload" as="font" href="/a.woff2" type="font/woff2" crossorigin=""/>
<link rel="stylesheet" href="/a.css"/>
</head><body><h1>Hola</h1><img src="/x.png" width="10" height="10" alt=""/></body></html>`;

const ok = { 'cache-control': 'public, s-maxage=300' };
const assets = { js: [], css: [Buffer.from('a{color:red}')], fonts: [36_000] };

describe('extractores', () => {
  it('scripts externos vs inline (ld+json no cuenta como JS)', () => {
    const html = '<script src="/a.js"></script><script>var a=1</script><script type="application/ld+json">{}</script>';
    expect(extractScriptSrcs(html)).toEqual(['/a.js']);
    expect(extractInlineScripts(html)).toEqual(['var a=1']);
  });
  it('stylesheets y preloads', () => {
    expect(extractStylesheetHrefs(GOOD)).toEqual(['/a.css']);
    expect(extractPreloads(GOOD)).toEqual([
      { as: 'image', href: '/hero.avif' },
      { as: 'font', href: '/a.woff2' },
    ]);
  });
  it('img sin width/height', () => {
    expect(imgsMissingDimensions('<img src="a" width="1"/><img src="b" width="1" height="2"/>')).toHaveLength(1);
  });
  it('cuenta h1 y presencia SEO', () => {
    expect(countH1('<h1>a</h1><h1 class="x">b</h1>')).toBe(2);
    expect(seoPresence(GOOD)).toEqual({ langEs: true, canonical: true, ogImage: true, ldJson: true });
    expect(seoPresence('<html lang="en"></html>').langEs).toBe(false);
  });
});

describe('evaluateBudget', () => {
  it('HTML sano pasa', () => {
    const r = evaluateBudget({ html: GOOD, headers: ok, assets });
    expect(r.violations).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('detecta cache-control no-store o ausente', () => {
    expect(evaluateBudget({ html: GOOD, headers: { 'cache-control': 'private, no-store' }, assets }).ok).toBe(false);
    expect(evaluateBudget({ html: GOOD, headers: {}, assets }).ok).toBe(false);
  });

  it('detecta más de un h1, img sin dimensiones, y SEO faltante', () => {
    const html = '<html><body><h1>a</h1><h1>b</h1><img src="x"/></body></html>';
    const v = evaluateBudget({ html, headers: ok, assets }).violations.join('|');
    expect(v).toMatch(/<h1>/);
    expect(v).toMatch(/sin width\/height/);
    expect(v).toMatch(/lang="es"/);
    expect(v).toMatch(/canonical/);
    expect(v).toMatch(/og:image/);
    expect(v).toMatch(/JSON-LD/);
  });

  it('límites de preloads y fuentes', () => {
    const extra = GOOD.replace('</head>', '<link rel="preload" as="image" href="/b.avif"/><link rel="preload" as="font" href="/b.woff2"/><link rel="preload" as="font" href="/c.woff2"/></head>');
    const v = evaluateBudget({ html: extra, headers: ok, assets: { ...assets, fonts: [50_000, 50_000, 10] } }).violations.join('|');
    expect(v).toMatch(/preloads de imagen/);
    expect(v).toMatch(/fuentes precargadas/);
  });

  it('JS y CSS gz sobre el tope', () => {
    // bytes pseudoaleatorios: no comprimen.
    const noise = (n: number) => randomBytes(n);
    const r = evaluateBudget({ html: GOOD, headers: ok, assets: { js: [noise(150_000)], css: [noise(30_000)], fonts: [] } });
    expect(r.violations.join('|')).toMatch(/JS gz/);
    expect(r.violations.join('|')).toMatch(/CSS gz/);
  });

  it('HTML demasiado grande', () => {
    const html = GOOD + 'x'.repeat(70 * 1024);
    expect(evaluateBudget({ html, headers: ok, assets }).violations.join('|')).toMatch(/HTML \d+ B/);
  });
});
