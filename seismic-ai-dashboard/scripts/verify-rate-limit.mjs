// Offline: never reads env files or contacts Redis/FastAPI.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { isIP } from 'node:net';
import ts from 'typescript';
const root = new URL('../', import.meta.url);
const compile = file => ts.transpileModule(fs.readFileSync(new URL(file, root), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const env = { VERCEL: '1', NODE_ENV: 'production', VERCEL_ENV: 'preview',
  UPSTASH_REDIS_REST_URL: 'https://redis.example.test', UPSTASH_REDIS_REST_TOKEN: 'test-only' };
const now = 1700000000000;
let passed = 0;
async function check(name, action) { await action(); passed++; console.log('PASS', name); }
function harness(overrides = {}, outcome = { success: true }) {
  const calls = [], configs = [];
  class Redis { constructor(config) { assert.equal(config.token, 'test-only'); } }
  class Ratelimit {
    static slidingWindow(count, duration) { assert.equal(count, 10); assert.equal(duration, '1 m'); return 'sliding-window'; }
    constructor(config) { configs.push(config); }
    async limit(id) { calls.push(id); if (outcome instanceof Error) throw outcome; return outcome; }
  }
  const exports = {};
  vm.runInNewContext(compile('app/api/predict/rate-limit.ts'), {
    exports, process: { env: { ...env, ...overrides } }, Response, URL,
    Date: class extends Date { static now() { return now; } },
    require(name) {
      if (name === 'server-only') return {};
      if (name === 'node:net') return { isIP };
      if (name === '@upstash/redis') return { Redis };
      if (name === '@upstash/ratelimit') return { Ratelimit };
      throw new Error('Unexpected import');
    },
  });
  return { run: headers => exports.checkPredictionRateLimit(new Request('http://localhost/api/predict', { headers })), calls, configs };
}
const trusted = { 'x-vercel-forwarded-for': '203.0.113.1' };
await check('allow valid IP; reuse client, disable memory cache; 10 per minute', async () => {
  const h = harness(); assert.equal(await h.run(trusted), null);
  await h.run({ 'x-vercel-forwarded-for': '203.0.113.2' });
  assert.deepEqual(h.calls, ['ip:203.0.113.1', 'ip:203.0.113.2']);
  assert.equal(h.configs.length, 1); assert.equal(h.configs[0].ephemeralCache, false);
  assert.equal(h.configs[0].timeout, 3000);
});
for (const [reset, expected] of [[now + 1450, '2'], [now - 1, '1']]) {
  await check('429 JSON and positive rounded Retry-After', async () => {
    const r = await harness({}, { success: false, reset }).run(trusted);
    assert.equal(r.status, 429); assert.equal(r.headers.get('Retry-After'), expected);
    assert.deepEqual(await r.json(), { error: '요청 횟수를 초과했습니다.' });
  });
}
for (const outcome of [new Error('must not be logged'), { success: true, reason: 'timeout' }]) {
  await check('Redis error / SDK fail-open timeout returns 503', async () => {
    assert.equal((await harness({}, outcome).run(trusted)).status, 503);
  });
}
for (const ip of [undefined, 'invalid', '203.0.113.1, 203.0.113.2']) {
  await check('missing/invalid/ambiguous trusted IP ignores arbitrary headers', async () => {
    const h = harness(); const headers = { 'x-forwarded-for': '203.0.113.9', 'x-real-ip': '203.0.113.9' };
    if (ip) headers['x-vercel-forwarded-for'] = ip;
    assert.equal((await h.run(headers)).status, 503); assert.equal(h.calls.length, 0);
  });
}
await check('canonical IPv6 key', async () => {
  const h = harness(); await h.run({ 'x-vercel-forwarded-for': '2001:0db8:0:0:0:0:0:1' });
  await h.run({ 'x-vercel-forwarded-for': '2001:db8::1' }); assert.equal(h.calls[0], h.calls[1]);
});
await check('local development ignores headers and shares a bucket', async () => {
  const h = harness({ VERCEL: undefined, NODE_ENV: 'development' });
  await h.run(trusted); await h.run({ 'x-forwarded-for': '203.0.113.9' });
  assert.deepEqual(h.calls, ['local-development', 'local-development']);
});
await check('non-Vercel production rejects forged platform header', async () => {
  const h = harness({ VERCEL: undefined }); assert.equal((await h.run(trusted)).status, 503);
  assert.equal(h.calls.length, 0);
});
for (const config of [{ UPSTASH_REDIS_REST_URL: undefined }, { UPSTASH_REDIS_REST_TOKEN: '' }, { UPSTASH_REDIS_REST_URL: 'http://redis.example.test' }]) {
  await check('missing/unsafe Redis configuration returns 503', async () => {
    const h = harness(config); assert.equal((await h.run(trusted)).status, 503); assert.equal(h.calls.length, 0);
  });
}
for (const status of [429, 503]) {
  await check(`${status} stops route before body read, validation or backend call`, async () => {
    const exports = {};
    vm.runInNewContext(compile('app/api/predict/route.ts'), {
      exports, require(name) {
        if (name === './rate-limit') return { checkPredictionRateLimit: async () => Response.json({ error: 'blocked' }, { status }) };
        if (name.endsWith('.json')) return {};
        return new Proxy({}, { get() { return () => { throw new Error('Unexpected backend/validation call'); }; } });
      },
    });
    assert.equal((await exports.POST({ get body() { throw new Error('Body must not be read'); } })).status, status);
  });
}
console.log(`${passed} checks passed; mocked SDK, no Redis integration calls.`);
