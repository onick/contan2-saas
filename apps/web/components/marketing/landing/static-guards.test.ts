// @vitest-environment node
// Guardas estáticas de la landing: lo que NO puede aparecer en el montaje
// estático (decisión A0: HTML pre-renderizado, 0 runtime JS).
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const WEB = join(__dirname, '..', '..', '..');
const LANDING_DIR = __dirname;
const PAGES_DIR = join(WEB, 'pages');
const CONTENT_FILES = [join(WEB, 'content', 'landing.ts'), join(WEB, 'content', 'landing.types.ts')];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const isSource = (p: string) => /\.(tsx?|css)$/.test(p) && !/\.test\.tsx?$/.test(p);
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const landingFiles = [...walk(LANDING_DIR), ...walk(PAGES_DIR), ...CONTENT_FILES].filter(isSource);
const rel = (p: string) => relative(WEB, p);

describe('guardas estáticas de la landing', () => {
  it('hay archivos que revisar', () => {
    expect(landingFiles.length).toBeGreaterThan(5);
  });

  it("sin 'use client' (Server Components puros)", () => {
    const hits = landingFiles.filter((p) => /^\s*['"]use client['"]/m.test(readFileSync(p, 'utf8')));
    expect(hits.map(rel)).toEqual([]);
  });

  it('sin gsap ni animaciones de terceros', () => {
    const hits = landingFiles.filter((p) => /\b(gsap|lottie|rive)\b/i.test(strip(readFileSync(p, 'utf8'))));
    expect(hits.map(rel)).toEqual([]);
  });

  it('sin <img crudo (se usa next/image)', () => {
    const hits = landingFiles.filter((p) => /<img[\s>]/.test(strip(readFileSync(p, 'utf8'))));
    expect(hits.map(rel)).toEqual([]);
  });

  it('sin force-dynamic, headers() ni cookies() en el montaje', () => {
    const hits = landingFiles.filter((p) =>
      /force-dynamic|next\/headers|\bheaders\(\)|\bcookies\(\)/.test(strip(readFileSync(p, 'utf8'))),
    );
    expect(hits.map(rel)).toEqual([]);
  });

  it('sin hooks de React (el HTML no se hidrata)', () => {
    const hits = landingFiles.filter((p) => /\buse(State|Effect|Ref|Memo|Callback|Reducer|Context)\s*\(/.test(strip(readFileSync(p, 'utf8'))));
    expect(hits.map(rel)).toEqual([]);
  });

  it('ningún test dentro de pages/ (todo archivo ahí es una ruta)', () => {
    const tests = walk(PAGES_DIR).filter((p) => /\.(test|spec)\.[jt]sx?$/.test(p));
    expect(tests.map(rel)).toEqual([]);
  });

  it('pages/_app importa solo el CSS de la landing', () => {
    const app = readFileSync(join(PAGES_DIR, '_app.tsx'), 'utf8');
    const cssImports = [...app.matchAll(/import\s+['"]([^'"]+\.css)['"]/g)].map((m) => m[1]);
    expect(cssImports).toEqual(['../styles/landing.css']);
  });

  it('las páginas estáticas desactivan el runtime JS', () => {
    for (const f of ['landing.tsx', 'contacto/enviado.tsx', 'contacto/error.tsx']) {
      expect(readFileSync(join(PAGES_DIR, f), 'utf8')).toContain('unstable_runtimeJS: false');
    }
  });
});
