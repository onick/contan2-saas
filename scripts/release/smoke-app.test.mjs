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

// Clean responses → OK
assert.equal(evaluateRoute(200, '<html><body>Welcome</body></html>'), 'OK');
assert.equal(evaluateRoute(302, ''), 'OK'); // redirect is fine
assert.equal(evaluateRoute(401, ''), 'OK'); // auth redirect is not a 500
assert.equal(evaluateRoute(404, '<html>Not found</html>'), 'OK'); // 404 is not a server error

console.log('All smoke-app tests passed.');
