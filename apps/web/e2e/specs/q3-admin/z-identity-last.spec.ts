// q3-admin/z-identity-last.spec.ts · ADM-18 identidad (color/logo) con reversion SIEMPRE en finally.
// CORRER AL FINAL de la tanda (otro agente saca capturas en paralelo): ventana corta, un solo cambio y vuelta atras.
//   pnpm e2e --project=desktop-1440 specs/q3-admin/z-identity-last.spec.ts
import { expect, test } from '../../fixtures/test';
import { record } from '../../fixtures/data';
import { apiFor, jsonOf } from '../../support/q3-api';
import { settle } from '../../support/q3-ui';

test.describe.configure({ retries: 0, mode: 'serial' });

/** Luminancia relativa WCAG y razon de contraste entre dos colores rgb(a). */
function ratio(a: string, b: string): number {
  const lum = (c: string) => {
    const [r, g, bl] = (c.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

const readVar = (loc: import('@playwright/test').Locator, name: string) =>
  loc.evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);

test.describe('ADM-18 · identidad', () => {
  test('ADM-18a [S1] el CTA primario ("Nueva actividad") cumple AA con la marca actual', async ({ page }) => {
    await page.goto('/app/actividades');
    await settle(page);
    const cta = page.getByRole('button', { name: 'Nueva actividad' }).first();
    const { bg, fg } = await cta.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el).color }));
    const r = ratio(bg, fg);
    test.info().annotations.push({ type: 'contraste', description: `CTA ${bg} / ${fg} = ${r.toFixed(2)}:1` });
    expect(r, `contraste del CTA primario ${bg} sobre ${fg}`).toBeGreaterThanOrEqual(4.5);
  });

  test('ADM-18b [S1] cambiar paleta desde la UI se aplica en todo el admin y se REVIERTE (finally)', { tag: '@write' }, async ({ page }) => {
    const api = await apiFor('owner');
    let original: { primaryColor: string; secondaryColor: string; sidebarTheme: string } | null = null;
    try {
      await page.goto('/app/identidad');
      await settle(page);
      const root = page.locator('div[style*="--color-brand"]').first();
      const primary = await readVar(root, '--color-brand');
      const accent = await readVar(root, '--color-brand-accent');
      const sidebarTheme = await page.locator('select').first().inputValue();
      expect(primary).toMatch(/^#[0-9a-f]{6}$/i);
      original = { primaryColor: primary, secondaryColor: accent, sidebarTheme };
      // Reversion garantizada tambien por el teardown si el proceso muriera a mitad.
      record({ kind: 'identity', label: 'identidad CCB: restaurar colores', cleanup: [{ method: 'PATCH', path: '/app/identidad/api/branding', body: original }] });

      await page.getByRole('button', { name: 'Paleta Verde' }).click();
      const patch = page.waitForResponse((r) => r.url().endsWith('/app/identidad/api/branding') && r.request().method() === 'PATCH');
      await page.getByRole('button', { name: 'Guardar cambios' }).click();
      expect((await patch).status(), 'PATCH branding').toBe(200);

      // Se aplica: otra pagina del admin usa el color nuevo.
      await page.goto('/app/actividades');
      await settle(page);
      const changed = await readVar(page.locator('div[style*="--color-brand"]').first(), '--color-brand');
      expect(changed.toLowerCase(), 'el color primario cambio').not.toBe(primary.toLowerCase());
      // CTA sigue cumpliendo AA con el color nuevo (el sistema elige texto oscuro/claro).
      const cta = page.getByRole('button', { name: 'Nueva actividad' }).first();
      const { bg, fg } = await cta.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el).color }));
      test.info().annotations.push({ type: 'contraste-paleta-verde', description: `${bg} / ${fg} = ${ratio(bg, fg).toFixed(2)}:1` });
      expect.soft(ratio(bg, fg), `CTA con la paleta Verde: ${bg} sobre ${fg}`).toBeGreaterThanOrEqual(4.5);
    } finally {
      if (original) {
        const back = await api.patch('/app/identidad/api/branding', { data: original });
        expect(back.status(), 'REVERSION de la identidad').toBe(200);
        const org = await jsonOf<{ organization?: { primaryColor?: string } }>(back);
        void org;
      }
      await api.dispose();
    }
    // verificacion final de la reversion en pantalla
    await page.goto('/app/actividades');
    await settle(page);
    const restored = await readVar(page.locator('div[style*="--color-brand"]').first(), '--color-brand');
    expect(restored.toLowerCase(), 'color primario restaurado').toBe(original!.primaryColor.toLowerCase());
  });

  test('ADM-18c [S2] logo: la subida valida tipo/tamano (rechaza un archivo que no es imagen) sin alterar la identidad', { tag: '@write' }, async () => {
    const api = await apiFor('owner');
    try {
      const bad = await api.post('/app/identidad/api/logo', { multipart: { logo: { name: 'no-es-imagen.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') } } });
      expect([400, 413, 415, 422], `subir texto como logo -> ${bad.status()}`).toContain(bad.status());
    } finally {
      await api.dispose();
    }
  });
});
