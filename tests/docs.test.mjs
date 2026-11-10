import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const documents = ['README.md', 'docs/GUIDE.md', 'docs/SETUP.md', 'docs/RELEASE.md'];

test('submission documentation has working local links, the existing logo and real PNG screenshots', async () => {
  for (const document of documents) {
    const file = resolve(root, document);
    const contents = await readFile(file, 'utf8');
    assert.match(contents, /subsense-mark\.svg/, `${document} must retain the product logo`);
    const targets = [
      ...Array.from(contents.matchAll(/\]\(([^)]+)\)/g), (match) => match[1]),
      ...Array.from(contents.matchAll(/(?:href|src)="([^"]+)"/g), (match) => match[1]),
    ];
    for (const target of targets) {
      if (/^(?:https?:|mailto:|#)/.test(target)) continue;
      const local = resolve(dirname(file), decodeURIComponent(target.split('#')[0]));
      assert.ok((await stat(local)).isFile(), `${document}: missing ${target}`);
    }
  }
  for (const image of ['dashboard', 'renewals', 'vault-unlock']) {
    const bytes = await readFile(resolve(root, 'docs/assets', `${image}.png`));
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.ok(bytes.readUInt32BE(16) >= 600, `${image} must be readable in documentation`);
    assert.ok(bytes.readUInt32BE(20) >= 300);
  }
});
