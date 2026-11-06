import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

const screens = build({
  stdin: { contents: `
    export { default as HomeConnections } from './src/subsense/HomeConnections.tsx';
    export { default as Vault } from './src/subsense/CredentialsVault.tsx';
  `, resolveDir: process.cwd() },
  bundle: true, packages: 'external', platform: 'node', format: 'esm', jsx: 'automatic', write: false,
  plugins: [{ name: 'home-wallet-fixture', setup(builder) {
    builder.onResolve({ filter: /^\.\/WalletAccess$/ }, () => ({ path: 'wallet-fixture', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
      export const useWalletAccess = () => ({ session: globalThis.homeWalletSession,
        refresh: async () => {}, lock: async () => {} });
    ` }));
    builder.onResolve({ filter: /^[^./]/ }, (args) => ({ path: import.meta.resolve(args.path), external: true }));
  } }],
}).then((result) => import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64')));

test('Home offers password unlock only for this wallet’s saved connections, without automatic requests', async () => {
  const { HomeConnections, Vault } = await screens;
  const originalStorage = globalThis.localStorage;
  const originalFetch = globalThis.fetch;
  const originalSession = globalThis.homeWalletSession;
  try {
    globalThis.homeWalletSession = { authenticated: true, walletAddress: '0x3', network: 'mainnet', vaultUnlocked: false };
    globalThis.fetch = async () => { throw new Error('Home must not automatically unlock or call providers'); };
    globalThis.localStorage = { getItem: () => null };
    const props = { busy: false, onBusy() {}, onConfig() {} };
    assert.equal(renderToString(createElement(HomeConnections, props)), '');
    const missing = renderToString(createElement(Vault, { unlockOnly: true, onChanged: async () => {}, onBusy() {} }));
    assert.match(missing, /No saved connection keys were found/);
    assert.doesNotMatch(missing, /<form|OpenRouter API key/);
    const expectedKey = `subsense_credential_vault_v1:0x${'3'.padStart(64, '0')}`;
    globalThis.localStorage = { getItem: (key) => key === expectedKey ? 'encrypted-test-vault' : null };
    const locked = renderToString(createElement(HomeConnections, props));
    assert.match(locked, /aria-label="Online connections"/);
    assert.match(locked, /Unlock online connections/);
    assert.match(locked, />Locked</);
    assert.match(locked, /Nothing is shared automatically/);
    const busy = renderToString(createElement(HomeConnections, { ...props, busy: true }));
    assert.match(busy, /<button[^>]*disabled=""[^>]*>[\s\S]*?Unlock online connections/);
    const unlock = renderToString(createElement(Vault, { unlockOnly: true, onChanged: async () => {}, onBusy() {} }));
    assert.match(unlock, /Your connection password/);
    assert.match(unlock, /autoComplete="current-password"/);
    assert.match(unlock, /Unlock connections/);
    assert.doesNotMatch(unlock, /Your connection keys|OpenRouter API key|Backups &amp; connection security|Forget saved vault|Change connection keys|ss-panel/);
    globalThis.homeWalletSession = { ...globalThis.homeWalletSession, vaultUnlocked: true, aiConfigured: true };
    const connected = renderToString(createElement(HomeConnections, props));
    assert.match(connected, />Unlocked</);
    assert.doesNotMatch(connected, /Unlock online connections/);
    globalThis.homeWalletSession = { ...globalThis.homeWalletSession, walletAddress: '0x4', vaultUnlocked: false };
    assert.equal(renderToString(createElement(HomeConnections, props)), '');
    globalThis.localStorage = { getItem() { throw new Error('Storage blocked'); } };
    assert.equal(renderToString(createElement(HomeConnections, props)), '');
  } finally {
    globalThis.localStorage = originalStorage;
    globalThis.fetch = originalFetch;
    globalThis.homeWalletSession = originalSession;
  }
});
