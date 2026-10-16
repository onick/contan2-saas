// q2-publico/kiosko-00-vacio.spec.ts · KIO-00 (hallazgo B18 de Q7): con 0 actividades abiertas la cartelera
// del kiosko queda vacia y sin mensaje. Corre ANTES de crear datos (orden alfabetico de archivos) y solo
// aplica si el tenant de staging tiene 0 actividades activas (si hay ajenas, no es reproducible -> skip).
import { expect, test } from '../../fixtures/test';
import { apiFor } from '../../support/q3-api';
import { NO_STATE, note, openKiosk } from '../../support/q2-common';

test.use({ storageState: NO_STATE });

test('KIO-00 sin actividades abiertas la cartelera explica que no hay (B18)', async ({ page }, testInfo) => {
  test.skip(!['webkit-tablet', 'desktop-1440'].includes(testInfo.project.name), 'kiosko: solo webkit-tablet y desktop-1440');
  const api = await apiFor('owner');
  const mine = await api.get('/app/check-in/api/activities');
  const items = ((await mine.json()) as { items?: unknown[] }).items ?? [];
  await api.dispose();
  test.skip(items.length > 0, `no reproducible: hay ${items.length} actividades activas en staging`);

  await openKiosk(page);
  await page.getByRole('button', { name: 'Toca para registrarte' }).click();
  await page.getByTestId('kiosk-step-activity').waitFor();
  const step = page.getByTestId('kiosk-step-activity');
  // BUG B18 (S2): el visitante ve "Elige tu actividad" sobre un espacio en blanco, sin explicacion ni salida clara.
  test.fail(true, 'BUG B18 (S2): ActivityScreen no tiene estado vacio (components/kiosko/screens.tsx)');
  note(testInfo, 'KIO-00/B18', 'S2', 'cartelera vacia sin mensaje');
  await expect(step.getByText(/no hay actividades|sin actividades|vuelve más tarde|por ahora no/i)).toBeVisible({ timeout: 2_000 });
});
