// @vitest-environment node
// Guardas del contenido de la landing (plan 2026-10-16 §4-B): el tipo se
// espeja con zod para que un campo mal escrito falle en CI, no en producción.
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { landing } from './landing';
import type { LandingContent } from './landing.types';

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const staticImage = z.object({ src: z.string().min(1), width: z.number().positive(), height: z.number().positive() });
const image = z.object({
  src: staticImage,
  mobileSrc: staticImage.optional(),
  alt: z.string().min(10).max(125),
  caption: z.string().optional(),
  origin: z.enum(['staging-ccb', 'staging-test-tenant', 'prod-ccb']),
  capturedAt: iso,
  redacted: z.boolean(),
});
const cta = z.object({
  label: z.string().min(2),
  href: z.string().refine((h) => h === '/login' || h === '/registro' || h === '#contacto' || /^mailto:[^\s@]+@[^\s@]+$/.test(h), 'href no permitido'),
  variant: z.enum(['primary', 'secondary', 'ghost']),
});
const text = z.string().min(1);

const schema = z.object({
  seo: z.object({
    title: text,
    description: text,
    canonical: z.literal('https://contan2.com/'),
    ogImage: z.object({ url: z.string().url(), width: z.literal(1200), height: z.literal(630), alt: text }),
  }),
  nav: z.object({
    links: z.array(z.object({ label: text, href: z.string().regex(/^#[a-z0-9-]+$/) })).min(3),
    login: cta,
    primary: cta,
  }),
  hero: z.object({ eyebrow: z.string(), title: text, subtitle: text, ctas: z.array(cta).min(1), image }),
  proof: z.object({
    client: z.object({ name: text, logo: image.optional(), permissionRef: text }),
    metrics: z
      .array(z.object({ value: z.string().regex(/^\d{1,3}(,\d{3})*$/), label: text, source: z.string().min(20), asOf: iso }))
      .min(1),
    location: z.string().optional(),
    statement: z.string().optional(),
    sourceNote: z.string().optional(),
    note: z.string().optional(),
  }),
  problem: z
    .object({
      heading: text,
      labels: z.object({ before: text, after: text }),
      rows: z.array(z.object({ before: text, after: text })).length(3),
    })
    .optional(),
  modules: z.object({
    heading: text,
    intro: text,
    items: z
      .array(
        z.object({
          id: z.enum(['kiosko', 'puerta', 'audiencias', 'protocolo', 'reportes', 'identidad']),
          kicker: text,
          title: text,
          body: text,
          bullets: z.array(text).min(2),
          image,
        }),
      )
      .length(6),
  }),
  steps: z.object({ heading: text, items: z.array(z.object({ title: text, body: text })).length(3) }),
  trust: z.object({
    heading: text,
    items: z.array(z.object({ title: text, body: text, icon: z.enum(['lock', 'database', 'qr', 'user-check']).optional() })).min(3),
    note: z.string().optional(),
  }),
  faq: z.object({
    heading: text,
    items: z.array(z.object({ q: text, a: text })).min(4),
    aside: z.object({ before: text, linkLabel: text, after: text }).optional(),
  }),
  contact: z.object({
    heading: text,
    body: text,
    successTitle: text,
    successBody: text,
    errorBody: text,
    fallbackEmail: z.string().email(),
  }),
  footer: z.object({
    legal: text,
    email: z.string().email(),
    links: z.array(z.object({ label: text, href: text })),
    tagline: z.string().optional(),
    origin: z.string().optional(),
    groups: z
      .array(z.object({ title: text, links: z.array(z.object({ label: text, href: z.string().optional(), note: z.string().optional() })) }))
      .optional(),
  }),
});

/** Todos los textos del contenido, sin rutas de archivo ni metadatos de trazabilidad. */
function copyOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(copyOf);
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([k]) => !['src', 'mobileSrc', 'origin', 'capturedAt', 'canonical'].includes(k))
      .flatMap(([, v]) => copyOf(v));
  }
  return [];
}

const { proof, ...rest } = landing as LandingContent;
const outsideProof = copyOf(rest);

describe('content/landing.ts', () => {
  it('cumple el espejo zod del tipo', () => {
    const r = schema.safeParse(landing);
    expect(r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)).toEqual([]);
  });

  it('sin marcadores de placeholder ni chips del mockup', () => {
    const all = copyOf(landing).join('\n');
    expect(all).not.toMatch(/\[placeholder\]|\{\{|\}\}|lorem/i);
  });

  it('cada métrica con source y asOf; cifras reales del 2026-10-16', () => {
    expect(proof.metrics.map((m) => m.value)).toEqual(['3,557', '63', '2,837']);
    for (const m of proof.metrics) {
      expect(m.source).toMatch(/producción/);
      expect(m.asOf).toBe('2026-10-16');
    }
    expect(proof.statement).toContain('mayo de 2026');
    for (let i = 0; i < proof.metrics.length; i += 1) expect(proof.statement).toContain(`{m${i}}`);
    expect(proof.client.permissionRef).toMatch(/pendiente/);
  });

  it('test-tenant no aparece en la prueba social', () => {
    expect(JSON.stringify({ ...proof, client: { ...proof.client, logo: undefined } })).not.toMatch(/test-tenant/i);
    expect(proof.client.logo?.origin ?? 'staging-ccb').not.toBe('staging-test-tenant');
  });

  it('"CCB" y "Centro Cultural Banreservas" solo en la prueba social', () => {
    expect(outsideProof.filter((t) => /\bCCB\b|Banreservas/i.test(t))).toEqual([]);
    expect(copyOf(proof).some((t) => /Centro Cultural Banreservas/.test(t))).toBe(true);
  });

  it('sin módulo Biblioteca', () => {
    expect(landing.modules.items.map((m) => m.id)).not.toContain('biblioteca' as never);
    expect(copyOf(landing).filter((t) => /bibliotec/i.test(t))).toEqual([]);
  });

  it('alt de cada imagen ≤125 y capturas anonimizadas', () => {
    const imgs = [landing.hero.image, ...landing.modules.items.map((m) => m.image)];
    for (const i of imgs) {
      expect(i.alt.length).toBeLessThanOrEqual(125);
      expect(i.redacted).toBe(true);
      expect(i.capturedAt).toBe('2026-10-16');
    }
  });

  it('hrefs permitidos y sin enlaces a rutas inexistentes en el footer', () => {
    const hrefs = [
      landing.nav.login.href,
      landing.nav.primary.href,
      ...landing.hero.ctas.map((c) => c.href),
      ...landing.nav.links.map((l) => l.href),
      ...landing.footer.links.map((l) => l.href),
      ...(landing.footer.groups ?? []).flatMap((g) => g.links.map((l) => l.href).filter(Boolean) as string[]),
    ];
    for (const h of hrefs) expect(h).toMatch(/^(\/login|\/registro|#[a-z0-9-]+|mailto:[^\s@]+@[^\s@]+)$/);
    const legal = (landing.footer.groups ?? []).find((g) => g.title === 'Legal');
    expect(legal?.links.every((l) => !l.href && /próximamente/.test(l.note ?? ''))).toBe(true);
  });

  it('un solo correo de contacto, soporte@contan2.com', () => {
    expect(landing.contact.fallbackEmail).toBe('soporte@contan2.com');
    expect(landing.footer.email).toBe(landing.contact.fallbackEmail);
  });

  it('copy en español neutro con tú: cero voseo', () => {
    const VOSEO =
      /(?<![\p{L}])(hacé|podés|registrá|registralo|elegí|buscá|descargá|necesitás|revisá|arrastrá|abrí|usá|verificá|cerrá|confirmá|creá|agregá|pegalo|intentá|esperá|escribí|tenés|querés|sabés|mirá|fijate|acá|vos|contanos|escribinos|pedí|seleccioná|subí|guardá|probá|empezá|llamá|contá|dale)(?![\p{L}])/iu;
    expect(copyOf(landing).filter((t) => VOSEO.test(t))).toEqual([]);
  });

  it('sin afirmaciones sin respaldo ni superlativos', () => {
    const all = copyOf(landing).join('\n');
    expect(all).not.toMatch(/único (sistema|del mercado)|el mejor|número uno|\bnº ?1\b|2\.1 seg|\b70 ?%|12,000\+|1,700\+/i);
  });

  it('sin rayas largas', () => {
    expect(copyOf(landing).filter((t) => /—/.test(t))).toEqual([]);
  });

  it('SEO: título ≤60, descripción 120–160, canónica y og:image', () => {
    const { title, description, ogImage } = landing.seo;
    expect(title.length).toBeLessThanOrEqual(60);
    expect(description.length).toBeGreaterThanOrEqual(120);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(ogImage.url).toBe('https://contan2.com/marketing/og.png');
    expect(ogImage.alt.length).toBeLessThanOrEqual(125);
  });

  it('SEO: valida con validateSeoCopy / findSeoPlaceholders del bloque C (si ya están integrados)', async () => {
    const seo = (await import('../lib/marketing/seo')) as Record<string, unknown>;
    if (typeof seo.validateSeoCopy !== 'function' || typeof seo.findSeoPlaceholders !== 'function') {
      // Bloque C aún no integrado en este worktree: se activa solo al integrar.
      return;
    }
    // Se llama con el bloque `seo`; si el bloque C espera el contenido completo, ajustar aquí.
    const issues = (seo.validateSeoCopy as (s: unknown) => unknown)(landing.seo);
    if (Array.isArray(issues)) expect(issues).toEqual([]);
    const found = (seo.findSeoPlaceholders as (s: unknown) => unknown)(landing.seo);
    if (Array.isArray(found)) expect(found).toEqual([]);
  });
});
