// support/layout.ts · checks de responsive/layout.
import { expect, type Locator, type Page } from '@playwright/test';

/** scrollWidth <= innerWidth + 1 (sin scroll horizontal de pagina). */
export async function expectNoHorizontalOverflow(page: Page, label = page.url()): Promise<void> {
  const m = await page.evaluate(() => ({
    scroll: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0),
    inner: window.innerWidth,
  }));
  expect(m.scroll, `overflow horizontal en ${label} (scrollWidth ${m.scroll} > innerWidth ${m.inner})`).toBeLessThanOrEqual(
    m.inner + 1,
  );
}

/** Target tactil minimo (24px admin WCAG 2.2; 44px kiosko/escaner). */
export async function expectMinTarget(locator: Locator, min = 24): Promise<void> {
  const box = await locator.boundingBox();
  expect(box, 'el elemento debe estar visible').not.toBeNull();
  expect(box!.width, `ancho de target < ${min}px`).toBeGreaterThanOrEqual(min);
  expect(box!.height, `alto de target < ${min}px`).toBeGreaterThanOrEqual(min);
}

/** Elemento dentro del viewport horizontal (CTA no recortado). */
export async function expectWithinViewportX(locator: Locator, page: Page): Promise<void> {
  const box = await locator.boundingBox();
  const w = page.viewportSize()?.width ?? 0;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(w + 1);
}

/** Texto del <html lang>. */
export async function htmlLang(page: Page): Promise<string> {
  return page.evaluate(() => document.documentElement.lang);
}
