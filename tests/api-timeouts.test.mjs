import test from 'node:test';
import assert from 'node:assert/strict';
import { api, setApiWallet } from '../src/subsense/api.ts';
import { AI_CLIENT_TIMEOUT_MS, AI_INFERENCE_TIMEOUT_MS } from '../shared/ai.mjs';

test('browser AI deadline leaves room for the server response without extending ordinary requests', async (t) => {
  const deadlines = [];
  let calls = 0;
  t.mock.method(AbortSignal, 'timeout', (ms) => {
    deadlines.push(ms);
    return new AbortController().signal;
  });
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    calls++;
    assert.equal(options.headers['X-SubSense-Wallet'], '0x3');
    assert.equal(options.credentials, 'same-origin');
    return new Response(JSON.stringify({ network: 'mainnet' }));
  });
  setApiWallet('0x3');
  t.after(() => setApiWallet(''));
  for (const path of ['/ai/run', '/connections/configure', '/auth/session', '/memories']) {
    await api(path, { network: 'mainnet' }, {
      wallet: '0x3',
      signal: new AbortController().signal,
    });
  }
  assert.equal(calls, 4);
  assert.equal(AI_CLIENT_TIMEOUT_MS, 135000);
  assert.ok(AI_CLIENT_TIMEOUT_MS > AI_INFERENCE_TIMEOUT_MS);
  assert.deepEqual(deadlines, [135000, 60000, 60000, 60000]);

  const message = 'AI request timed out after 120 seconds. No automatic retry or paid fallback was made.';
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response(JSON.stringify({ message }), { status: 502 });
  });
  await assert.rejects(api('/ai/run', { network: 'mainnet' }), (error) => error.message === message);
  assert.equal(calls, 5);
});
