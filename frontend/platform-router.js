// =============================================================================
// platform-router.js · helpers puros del router del SPA platform admin
// =============================================================================
// Extraídos de platform-app.js para que sean unit-testeables sin DOM ni mocks
// de fetch. Se cargan ANTES de platform-app.js en platform-dashboard.html y
// quedan disponibles como `window.PFRouter`.
//
// Contrato:
//   pickHandler(views, route, params) → { fn, args }
//     Decide a qué función de PFViews despachar dada la ruta parseada.
//     - Sub-rutas dinámicas (ej. `tenants/<uuid>`) tienen prioridad sobre
//       el dispatch genérico por nombre de ruta. Antes de este archivo,
//       navigate() veía PFViews.tenants (lista), nunca llegaba al
//       fallback que delegaba a tenantDetail → la URL /#/tenants/<id>
//       siempre renderizaba la lista. Bug corregido aquí.
//     - Si la ruta no matchea nada conocido, cae a `operacion` (home).
//     - Si la vista escogida no existe en PFViews, devuelve `fn: undefined`
//       para que el caller decida (típicamente: no hacer nada).
//
//   runHandlerSafely(handler, Toast, logger) → Promise<void>
//     Ejecuta `handler.fn(...handler.args)` con try/catch. Si lanza:
//       - logger(e) si está provisto (típicamente console.error)
//       - Toast.error(message) si Toast está provisto
//     Si handler.fn es falsy, no hace nada.
// =============================================================================

(function (root) {
  'use strict';

  function pickHandler(views, route, params) {
    const safeParams = Array.isArray(params) ? params : [];

    // 1. Sub-rutas dinámicas con prioridad. Por ahora solo tenants/<id>;
    //    si más adelante se suman (ej. audit/<id>, users/<id>), agregar
    //    casos acá. El antiguo dispatch genérico llamaba a PFViews.tenants
    //    incluso cuando había un id, ignorándolo y renderizando la lista.
    if (route === 'tenants' && safeParams[0]) {
      return { fn: views && views.tenantDetail, args: [safeParams[0]] };
    }

    // 2. Dispatch genérico por nombre de ruta.
    if (views && typeof views[route] === 'function') {
      return { fn: views[route], args: safeParams };
    }

    // 3. Fallback al home (operacion).
    return { fn: views && views.operacion, args: [] };
  }

  async function runHandlerSafely(handler, Toast, logger) {
    if (!handler || typeof handler.fn !== 'function') return;
    try {
      await handler.fn(...handler.args);
    } catch (e) {
      if (typeof logger === 'function') {
        try { logger(e); } catch { /* logger no debe tumbar el handler */ }
      }
      if (Toast && typeof Toast.error === 'function') {
        try { Toast.error((e && e.message) || 'No se pudo cargar la vista'); }
        catch { /* idem */ }
      }
    }
  }

  root.PFRouter = { pickHandler, runHandlerSafely };
})(typeof window !== 'undefined' ? window : globalThis);
