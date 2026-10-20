// support/q3-ui.ts · helpers de UI para Q3 (admin core). Selectores por rol/label; nunca clases Tailwind.
import { expect, test, type Locator, type Page } from '@playwright/test';

/** Valor para <input type="datetime-local"> en la zona America/Santo_Domingo, `min` minutos desde ahora. */
export function localDateTime(min: number): string {
  const d = new Date(Date.now() + min * 60_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santo_Domingo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Fila (tabla md+) o tarjeta (movil) de una actividad por su nombre. */
export function activityRow(page: Page, name: string): Locator {
  return page.locator('tr, li').filter({ hasText: name }).filter({ visible: true }).first();
}

/**
 * Panel de detalle de un perfil de usuario (master-detail). En desktop-1440 es una region
 * (columna fija, \`aside\`) y por debajo de xl un dialogo: ambos llevan \`data-detail-panel\`.
 * Filtra por el texto (codigo): el estado vacio de la columna no lo contiene, asi que tras
 * cerrar el perfil el locator queda en 0.
 */
export function profilePanel(page: Page, code: string): Locator {
  return page.locator('[data-detail-panel]').filter({ hasText: code }).filter({ visible: true });
}

/** Espera a que Next termine de hidratar (los handlers de React ya estan montados). */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

/** Abre el menu "Mas acciones" de una fila y pulsa un item. */
export async function rowMenu(page: Page, name: string, item: string | RegExp): Promise<void> {
  const row = activityRow(page, name);
  await expect(row).toBeVisible();
  const trigger = row.getByRole('button', { name: 'Más acciones' });
  // El scroll (asincrono) que provoca el scrollIntoView de Playwright llegaria DESPUES del click y cerraria el menu.
  await trigger.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await trigger.click();
  // El menu (portal fixed) se cierra con cualquier 'scroll' en captura, incluido el que dispara el
  // scrollIntoView de un click de Playwright -> se opera por teclado (de paso prueba ↑↓ + Enter).
  const items = page.getByRole('menuitem');
  await expect(items.first()).toBeFocused();
  const names = await items.allTextContents();
  const idx = names.findIndex((n) => (typeof item === 'string' ? n.trim() === item : item.test(n.trim())));
  expect(idx, `item de menu "${String(item)}" entre [${names.join(' | ')}]`).toBeGreaterThanOrEqual(0);
  for (let i = 0; i < idx; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
}

export const CODE_RE = /CCB-[A-Z0-9]{6}/;
