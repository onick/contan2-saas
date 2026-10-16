// support/mask.ts · enmascarado de PII para informes y screenshots.
import type { Locator, Page } from '@playwright/test';

/** juan@dominio.com -> j***@d***.com */
export function maskEmail(email: string): string {
  const m = /^([^@])[^@]*@([^.])[^.]*(\..+)$/.exec(email.trim());
  return m ? `${m[1]}***@${m[2]}***${m[3]}` : '***';
}

/** "Juan Perez Lopez" -> "Juan P." */
export function maskName(full: string): string {
  const [first, second] = full.trim().split(/\s+/);
  return second ? `${first} ${second[0]}.` : (first ?? '***');
}

/** Reemplaza emails y telefonos en un texto libre. */
export function scrubPII(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, (e) => maskEmail(e))
    .replace(/\b\d{3}[-\s.]?\d{3}[-\s.]?\d{4}\b/g, '***-***-****');
}

/** Locators a pasar en `mask:` de toHaveScreenshot / screenshot (filas que NO son [E2E]). */
export function piiMasks(page: Page): Locator[] {
  return [
    page.locator('[data-pii]'),
    page.locator('tbody tr:not(:has-text("[E2E]")) td'),
    page.locator('input[type="email"], input[type="tel"], input[name*="email" i], input[name*="phone" i]'),
  ];
}
