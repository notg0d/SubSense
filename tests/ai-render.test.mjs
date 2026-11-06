import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { freshWorkspace } from '../src/subsense/workspace.ts';

test('AI screens render with consent off, no automatic requests and no sample-loading control', async () => {
  const result = await build({ stdin: { contents: `
    export { default as Assistant } from './src/subsense/AssistantView.tsx';
    export { default as Vault } from './src/subsense/CredentialsVault.tsx';
    export { default as Settings } from './src/subsense/SettingsView.tsx';
  `, resolveDir: process.cwd() }, bundle: true, packages: 'external', platform: 'node',
    format: 'esm', jsx: 'automatic', write: false, plugins: [{ name: 'test-wallet-context', setup(builder) {
      builder.onResolve({ filter: /^\.\/WalletAccess$/ }, () => ({ path: 'test-wallet', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents:
        "export const useWalletAccess = () => ({ session: { authenticated: true, walletAddress: '0x3', network: 'mainnet' }, refresh: async()=>{}, lock: async()=>{} });" }));
      builder.onResolve({ filter: /^[^./]/ }, (args) => ({ path: import.meta.resolve(args.path), external: true }));
    } }],
  });
  const module = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error('Rendering must never call providers'); };
    const workspace = freshWorkspace();
    const html = renderToString(createElement(module.Assistant, { workspace, onBusy() {}, onConnections() {}, locked: false }));
    assert.match(html, /Set up AI help/); assert.match(html, /Nothing to share yet/);
    assert.match(html, /Find a decision/); assert.match(html, /Explain decisions/); assert.match(html, /Plan renewals/);
    assert.match(html, /type="checkbox"[^>]*disabled/);
    assert.doesNotMatch(html, /type="checkbox"[^>]*checked/);
    assert.match(html, /Allow data-collecting providers for this demo request/);
    assert.match(html, /synthetic demo data/); assert.match(html, /retain or train/);
    assert.match(html, /Strict default/); assert.match(html, /cannot override/);
    assert.match(html, /aria-describedby="demo-privacy-hint"/);
    assert.match(html, /<button[^>]*disabled=""[^>]*>[\s\S]*?Ask assistant/);
    assert.match(html, /<button[^>]*disabled=""[^>]*>Select all<\/button>/);
    workspace.subscriptions = [{ id: 'service', name: 'Subscription to share', category: 'Other', costCents: 1000,
      cadence: 'monthly', usage: 'frequent', importance: 'useful', status: 'active', renewsOn: '2027-01-01', workRelated: false, notes: '' }];
    const populated = renderToString(createElement(module.Assistant, { workspace, onBusy() {}, onConnections() {}, locked: false }));
    assert.match(populated, /<button[^>]*>Select all<\/button>/);
    assert.doesNotMatch(populated, /<button[^>]*disabled=""[^>]*>Select all<\/button>/);
    assert.doesNotMatch(populated, /type="checkbox"[^>]*checked/);
    for (const props of [{ locked: true }, { workspace: { ...workspace, sample: true } }]) {
      const disabled = renderToString(createElement(module.Assistant, { workspace, onBusy() {}, onConnections() {}, locked: false, ...props }));
      assert.match(disabled, /<button[^>]*disabled=""[^>]*>Select all<\/button>/);
    }
    const large = renderToString(createElement(module.Assistant, { workspace: { ...workspace,
      subscriptions: Array.from({ length: 101 }, (_, index) => ({ ...workspace.subscriptions[0], id: `service-${index}` })) },
      onBusy() {}, onConnections() {}, locked: false }));
    assert.match(large, /Select first 100/);
    assert.match(large, /You can share up to 100 records per request/);
    const vault = renderToString(createElement(module.Vault, { onChanged: async () => {}, onBusy() {} }));
    assert.match(vault, /OpenRouter API key \(optional\)/); assert.match(vault, /AI-only setup/);
    assert.doesNotMatch(vault + html, /OpenAI|gpt-4|text-embedding-3-small/);
    assert.match(vault, /Nemotron 3.5 Super VL/); assert.match(vault, /Flint v1.0/);
    const settings = renderToString(createElement(module.Settings, { workspace, commit() {}, replace() {}, locked: false, busy: false, wallet: '0x3' }));
    assert.doesNotMatch(settings, /Load sample workspace/);
  } finally { globalThis.fetch = original; }
});
