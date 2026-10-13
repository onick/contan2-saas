/**
 * smoke-app.test.mjs — Unit tests for the evaluateRoute function.
 *
 * Run with:
 *   node scripts/release/smoke-app.test.mjs
 *
 * No HTTP calls are made. No env vars are required.
 */

import assert from 'node:assert/strict';
import { evaluateRoute } from './smoke-app.mjs';

// status >= 500 → FAIL
assert.equal(evaluateRoute(500, '<html>OK</html>'), 'FAIL');
assert.equal(evaluateRoute(503, ''), 'FAIL');
assert.equal(evaluateRoute(502, 'Bad Gateway'), 'FAIL');

// Error strings in body → FAIL
assert.equal(evaluateRoute(200, "<html>This page couldn't load</html>"), 'FAIL');
assert.equal(evaluateRoute(200, '<html>Application error</html>'), 'FAIL');
assert.equal(evaluateRoute(200, 'Internal Server Error'), 'FAIL');

// Clean responses → OK (public routes: no isProtected)
assert.equal(evaluateRoute(200, '<html><body>Welcome</body></html>'), 'OK');
assert.equal(evaluateRoute(302, ''), 'OK'); // redirect on public route is fine
assert.equal(evaluateRoute(401, ''), 'OK'); // 401 on public route is not a server error
assert.equal(evaluateRoute(404, '<html>Not found</html>'), 'OK'); // 404 is not a server error

// Protected routes: redirect-to-login → FAIL
assert.equal(
  evaluateRoute(200, '<html>Login</html>', { isProtected: true, finalUrl: 'https://ccb.contan2.com/login' }),
  'FAIL',
);
assert.equal(
  evaluateRoute(200, '<html>Login</html>', { isProtected: true, finalUrl: 'https://ccb.contan2.com/login?returnTo=%2Fapp%2Factividades' }),
  'FAIL',
);

// Protected routes: 401/403 → FAIL
assert.equal(evaluateRoute(401, '', { isProtected: true }), 'FAIL');
assert.equal(evaluateRoute(403, '', { isProtected: true }), 'FAIL');

// Protected routes: redirect within /app (not to login) → OK
assert.equal(
  evaluateRoute(200, '<html>App</html>', { isProtected: true, finalUrl: 'https://ccb.contan2.com/app/actividades' }),
  'OK',
);

// Protected routes: 401/403 without isProtected → OK (public surface)
assert.equal(evaluateRoute(401, '', { isProtected: false }), 'OK');

console.log('All smoke-app tests passed.');
