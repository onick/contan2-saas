// scripts/release/lib/coolify.test.mjs
// Plain Node.js test — no framework. Run with: node scripts/release/lib/coolify.test.mjs

import assert from 'node:assert/strict';

// ---- Test 1: body shape and URL, happy path (PATCH 200) ----

let lastFetchArgs = null;
globalThis.fetch = async (url, opts) => {
  lastFetchArgs = { url, opts };
  return { status: 200, json: async () => ({}) };
};

const { upsertSourceCommitEnv } = await import('./coolify.mjs');

const result1 = await upsertSourceCommitEnv({
  baseUrl: 'https://coolify.example.com',
  token: 'tok_test',
  appUuid: 'app-uuid-123',
  sha: 'abc1234567890',
});

// Body has correct shape
const body = JSON.parse(lastFetchArgs.opts.body);
assert.equal(body.key, 'SOURCE_COMMIT', 'key must be SOURCE_COMMIT');
assert.equal(body.value, 'abc1234567890', 'value must be the provided sha');
assert.equal(body.is_buildtime, true, 'is_buildtime must be true');
assert.equal(body.is_runtime, false, 'is_runtime must be false');

// Token is in Authorization header but not exposed as value in the test log
assert.ok(
  lastFetchArgs.opts.headers.Authorization.startsWith('Bearer '),
  'Authorization header must start with "Bearer "',
);

// URL is correct
assert.ok(
  lastFetchArgs.url.includes('/api/v1/applications/app-uuid-123/envs'),
  'URL must include /api/v1/applications/<appUuid>/envs',
);

// Method returned is PATCH when PATCH succeeds
assert.equal(result1.method, 'PATCH', 'should return PATCH on 200');
assert.equal(result1.status, 200, 'should return status 200');

// ---- Test 2: PATCH 201 also considered a success ----

globalThis.fetch = async (_url, opts) => {
  return { status: 201 };
};

const result2 = await upsertSourceCommitEnv({
  baseUrl: 'https://coolify.example.com',
  token: 'tok_test',
  appUuid: 'app-uuid-123',
  sha: 'deadbeef',
});
assert.equal(result2.method, 'PATCH', 'PATCH 201 should still return method PATCH');
assert.equal(result2.status, 201, 'status should be 201');

// ---- Test 3: falls back to POST when PATCH returns non-200/201 ----

let callCount = 0;
globalThis.fetch = async (_url, opts) => {
  callCount++;
  if (opts.method === 'PATCH') return { status: 409 }; // conflict or not-found
  return { status: 201 };
};

const result3 = await upsertSourceCommitEnv({
  baseUrl: 'https://coolify.example.com',
  token: 'tok_test',
  appUuid: 'app-uuid-123',
  sha: 'abc1234',
});
assert.equal(result3.method, 'POST', 'should fall back to POST on PATCH 409');
assert.equal(result3.status, 201, 'POST status should be 201');
assert.equal(callCount, 2, 'fetch should be called twice (PATCH then POST)');

// ---- Test 4: token never appears in the body ----

let capturedBody = null;
globalThis.fetch = async (_url, opts) => {
  capturedBody = opts.body;
  return { status: 200 };
};

await upsertSourceCommitEnv({
  baseUrl: 'https://coolify.example.com',
  token: 'super_secret_token_xyz',
  appUuid: 'app-uuid-123',
  sha: 'cafebabe',
});
assert.ok(
  !capturedBody.includes('super_secret_token_xyz'),
  'token must NOT appear in the request body',
);

console.log('All tests passed.');
