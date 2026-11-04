import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { freshWorkspace } from '../src/subsense/workspace.ts';
import { DEFAULT_CHAT_MODEL, EMBEDDING_MODEL } from '../shared/ai.mjs';

const screens = build({
  stdin: { contents: `
    export { default as Vault } from './src/subsense/CredentialsVault.tsx';
    export { default as Connections } from './src/subsense/ConnectionsView.tsx';
    export { default as Assistant } from './src/subsense/AssistantView.tsx';
    export { ExternalLink, Field } from './src/subsense/ui.tsx';
  `, resolveDir: process.cwd() },
  bundle: true, packages: 'external', platform: 'node', format: 'esm', jsx: 'automatic', write: false,
  plugins: [{ name: 'configuration-wallet-fixture', setup(builder) {
    builder.onResolve({ filter: /^\.\/WalletAccess$/ }, () => ({ path: 'wallet-fixture', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
      export const useWalletAccess = () => ({ session: { authenticated: true, walletAddress: '0x3', network: 'mainnet' }, refresh: async()=>{}, lock: async()=>{} });
    ` }));
    builder.onResolve({ filter: /^[^./]/ }, (args) => ({ path: import.meta.resolve(args.path), external: true }));
  } }],
}).then((result) => import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64')));

function fieldMarkup(html, label) {
  const labelAt = html.indexOf(`>${label}</label>`);
  assert.notEqual(labelAt, -1, `Missing field: ${label}`);
  const markup = html.slice(html.lastIndexOf('<div', labelAt), html.indexOf('</div>', labelAt));
  const hintId = markup.match(/aria-describedby="([^"]+)"/)?.[1];
  assert.ok(hintId, `Missing accessible hint: ${label}`);
  assert.ok(markup.includes(`<span id="${hintId}"`), `Hint is not associated with ${label}`);
  assert.doesNotMatch(markup, /<label[^>]*>[\s\S]*?<a\b[\s\S]*?<\/label>/);
  return markup;
}

test('each connection credential links to its provider with an associated setup hint', async () => {
  const { Vault } = await screens;
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error('Setup links must not call providers automatically.'); };
    for (const feature of ['ai', 'memory']) {
      const html = renderToString(createElement(Vault, { feature, onChanged: async () => {}, onBusy() {} }));
      assert.match(fieldMarkup(html, 'OpenRouter API key (optional)'), /href="https:\/\/openrouter\.ai\/settings\/keys"/);
      const tatum = fieldMarkup(html, 'Tatum Mainnet API key');
      assert.match(tatum, /href="https:\/\/dashboard\.tatum\.io\/api-keys"/);
      assert.match(tatum, /Mainnet key with Sui GraphQL access/);
      const delegate = fieldMarkup(html, 'MemWal delegate private key');
      assert.match(delegate, /href="https:\/\/memory\.walrus\.xyz\/"/);
      assert.match(delegate, /href="https:\/\/docs\.wal\.app\/walrus-memory\/contract\/delegate-key-management"/);
      assert.match(delegate, /never your owner wallet key or recovery phrase/);
      const account = fieldMarkup(html, 'MemWal Mainnet account object ID');
      assert.match(account, /href="https:\/\/memory\.walrus\.xyz\/"/);
      assert.match(account, /not a wallet address, package ID or registry ID/);
      assert.ok(html.includes(`href="https://openrouter.ai/${DEFAULT_CHAT_MODEL}"`));
      assert.ok(html.includes(`href="https://openrouter.ai/${EMBEDDING_MODEL}"`));
      assert.match(html, /href="https:\/\/openrouter\.ai\/settings\/privacy"/);
      assert.match(html, /Walrus Memory setup guide/);
      assert.doesNotMatch(html, /href="[^"]*(?:testnet|dev\.memwal|[?&](?:key|account|wallet)=)/);
      if (feature === 'memory') assert.match(html, /<details class="ss-disclosure" open=""><summary>Online memory connection/);
      for (const anchor of html.matchAll(/<a\b[^>]*>/g)) {
        assert.match(anchor[0], /target="_blank"/);
        assert.match(anchor[0], /rel="noopener noreferrer"/);
      }
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('advanced tools link to endpoint documentation and transaction lookup', async () => {
  const { Connections, Assistant } = await screens;
  const workspace = freshWorkspace();
  const html = renderToString(createElement(Connections, { workspace, commit() {}, locked: false, onBusy() {}, onConfig() {} }));
  assert.match(html, /href="https:\/\/docs\.tatum\.io\/"/);
  assert.match(html, /href="https:\/\/docs\.wal\.app\/walrus-memory\/relayer\/public-relayer"/);
  assert.match(html, /no endpoint URL is needed during setup/);
  assert.match(html, /<input[^>]*aria-describedby="sui-address-source-hint"/);
  assert.match(html, /<p id="sui-address-source-hint"[^>]*>[\s\S]*?href="https:\/\/suivision\.xyz\/"/);
  const digest = fieldMarkup(html, 'Sui transaction digest');
  assert.match(digest, /href="https:\/\/suivision\.xyz\/"/);
  assert.match(digest, /Copy the transaction digest, not the page URL/);
  const assistant = renderToString(createElement(Assistant, { workspace, locked: false, onBusy() {}, onConnections() {} }));
  assert.match(assistant, /href="https:\/\/openrouter\.ai\/settings\/privacy"/);
});

test('external links announce new tabs and preserve existing field descriptions', async () => {
  const { ExternalLink, Field } = await screens;
  const html = renderToString(createElement(Field, {
    label: 'API key',
    hint: createElement(ExternalLink, { href: 'https://dashboard.tatum.io/' }, 'Get a key'),
  }, createElement('input', { id: 'test-key', 'aria-describedby': 'existing-help' })));
  assert.match(html, /<label for="test-key">API key<\/label>/);
  const describedBy = html.match(/aria-describedby="existing-help ([^"]+)"/)?.[1];
  assert.ok(describedBy);
  assert.ok(html.includes(`<span id="${describedBy}"`));
  assert.match(html, /class="sr-only"> \(opens in a new tab\)/);
  assert.match(html, /focus-visible:ring-focus-ring/);
});
