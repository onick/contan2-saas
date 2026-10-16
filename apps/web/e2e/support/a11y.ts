// support/a11y.ts · axe-core con ratchet. Falla con critical/serious NUEVOS (no en a11y-baseline.json);
// moderate/minor se adjuntan al reporte sin fallar.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { E2E_DIR } from '../env';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BASELINE = path.join(E2E_DIR, 'a11y-baseline.json');

/** { "<nombre de pantalla>": ["rule-id", ...] } -- violaciones conocidas que no deben empeorar. */
function loadBaseline(): Record<string, string[]> {
  if (!existsSync(BASELINE)) return {};
  try {
    return JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<string, string[]>;
  } catch {
    return {};
  }
}

export interface A11yOptions {
  /** Nombre estable de la pantalla/estado (clave del baseline). */
  name: string;
  include?: string[];
  exclude?: string[];
}

export async function checkA11y(page: Page, testInfo: TestInfo, opts: A11yOptions) {
  let b = new AxeBuilder({ page }).withTags(TAGS);
  for (const s of opts.include ?? []) b = b.include(s);
  for (const s of opts.exclude ?? []) b = b.exclude(s);
  const { violations } = await b.analyze();

  const known = new Set(loadBaseline()[opts.name] ?? []);
  const blocking = violations.filter(
    (v) => (v.impact === 'critical' || v.impact === 'serious') && !known.has(v.id),
  );
  const minor = violations.filter((v) => v.impact === 'moderate' || v.impact === 'minor');

  const summary = (list: typeof violations) =>
    list.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes[0]?.target }));

  if (violations.length) {
    await testInfo.attach(`a11y-${opts.name}.json`, {
      body: JSON.stringify({ blocking: summary(blocking), advisory: summary(minor), all: summary(violations) }, null, 2),
      contentType: 'application/json',
    });
  }
  expect(summary(blocking), `a11y critical/serious en "${opts.name}"`).toEqual([]);
  return { violations, blocking, minor };
}
