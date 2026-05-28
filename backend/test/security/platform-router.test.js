// =============================================================================
// test/security/platform-router.test.js
// =============================================================================
// Cubre el fix del SPA platform admin (rama fix/platform-router-tenant-detail).
//
// Bug: navigate() en platform-app.js hacía dispatch genérico
//   const view = window.PFViews[route];      // 'tenants' → list view (existe)
//   if (!view) renderNotFound();
//   await view(...params);                   // ignora params[0] → siempre lista
// Resultado: la URL /#/tenants/<uuid> nunca llegaba a la vista de detalle
// porque PFViews.tenants existe (es la lista), y el `if (!view)` no se
// disparaba. La vista tenantDetail solo se llamaba si tenants no existía,
// que nunca pasa.
//
// Fix: extraer un router puro (frontend/platform-router.js → window.PFRouter)
// con pickHandler() que da prioridad a la sub-ruta dinámica (route='tenants'
// && params[0]) ANTES del dispatch genérico. Este archivo es importable
// sin DOM ni fetch, así que se puede unit-testear con vitest puro.
//
// Tests (4):
//   1. /#/tenants/<uuid>   → tenantDetail(uuid)
//   2. /#/tenants/<uuid>   → NO llama tenants
//   3. /#/tenants          → tenants (lista)
//   4. handler que lanza   → Toast.error() invocado
// =============================================================================

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const ROUTER_PATH = path.join(REPO_ROOT, 'frontend', 'platform-router.js');

// Cargamos el archivo browser-side en un sandbox node, sin DOM. El IIFE
// del archivo recibe el "root" y le pega `.PFRouter`. Le pasamos un objeto
// vacío como root y leemos PFRouter de ahí — más limpio que tocar global.
function loadPFRouter() {
  const src = readFileSync(ROUTER_PATH, 'utf8');
  const sandbox = {};
  // El archivo termina con: })(typeof window !== 'undefined' ? window : globalThis);
  // así que para inyectar nuestro sandbox lo envolvemos en un Function que
  // expone `window` y `globalThis` apuntando al mismo objeto.
  const fn = new Function('window', 'globalThis', src);
  fn(sandbox, sandbox);
  if (!sandbox.PFRouter) {
    throw new Error('platform-router.js no expuso PFRouter en el sandbox');
  }
  return sandbox.PFRouter;
}

let PFRouter;
beforeAll(() => {
  PFRouter = loadPFRouter();
});

describe('pickHandler · sub-ruta dinámica tenants/<id> tiene prioridad', () => {
  it('1. /#/tenants/<uuid> → tenantDetail(uuid)', () => {
    const views = {
      tenants: vi.fn(),
      tenantDetail: vi.fn(),
      operacion: vi.fn(),
    };
    const uuid = '11111111-2222-3333-4444-555555555555';
    const handler = PFRouter.pickHandler(views, 'tenants', [uuid]);
    expect(handler.fn).toBe(views.tenantDetail);
    expect(handler.args).toEqual([uuid]);
  });

  it('2. /#/tenants/<uuid> NO devuelve la vista de lista `tenants`', () => {
    const views = {
      tenants: vi.fn(),
      tenantDetail: vi.fn(),
      operacion: vi.fn(),
    };
    const handler = PFRouter.pickHandler(views, 'tenants', ['abc-123']);
    expect(handler.fn).not.toBe(views.tenants);
  });

  it('3. /#/tenants (sin params) → tenants (lista)', () => {
    const views = {
      tenants: vi.fn(),
      tenantDetail: vi.fn(),
      operacion: vi.fn(),
    };
    const handler = PFRouter.pickHandler(views, 'tenants', []);
    expect(handler.fn).toBe(views.tenants);
    expect(handler.args).toEqual([]);
  });

  it('extra · ruta desconocida cae a operacion', () => {
    const views = {
      tenants: vi.fn(),
      operacion: vi.fn(),
    };
    const handler = PFRouter.pickHandler(views, 'noexiste', []);
    expect(handler.fn).toBe(views.operacion);
  });

  it('extra · params no-array no rompe (defensive)', () => {
    const views = { tenants: vi.fn(), tenantDetail: vi.fn(), operacion: vi.fn() };
    const handler = PFRouter.pickHandler(views, 'tenants', null);
    expect(handler.fn).toBe(views.tenants);
  });
});

describe('runHandlerSafely · errores van a Toast.error', () => {
  it('4. Si la vista lanza, llama Toast.error(message)', async () => {
    const Toast = { error: vi.fn() };
    const handler = {
      fn: async () => { throw new Error('detalle no disponible'); },
      args: ['uuid'],
    };
    await PFRouter.runHandlerSafely(handler, Toast, () => {});
    expect(Toast.error).toHaveBeenCalledOnce();
    expect(Toast.error).toHaveBeenCalledWith('detalle no disponible');
  });

  it('Si la vista NO lanza, no toca Toast.error', async () => {
    const Toast = { error: vi.fn() };
    const handler = { fn: vi.fn(async () => {}), args: [] };
    await PFRouter.runHandlerSafely(handler, Toast, () => {});
    expect(handler.fn).toHaveBeenCalledOnce();
    expect(Toast.error).not.toHaveBeenCalled();
  });

  it('logger se invoca cuando hay error', async () => {
    const Toast = { error: vi.fn() };
    const logger = vi.fn();
    const err = new Error('boom');
    await PFRouter.runHandlerSafely(
      { fn: async () => { throw err; }, args: [] },
      Toast,
      logger,
    );
    expect(logger).toHaveBeenCalledWith(err);
  });

  it('handler.fn falsy → no-op sin throw', async () => {
    const Toast = { error: vi.fn() };
    await expect(
      PFRouter.runHandlerSafely({ fn: undefined, args: [] }, Toast, () => {})
    ).resolves.toBeUndefined();
    expect(Toast.error).not.toHaveBeenCalled();
  });
});
