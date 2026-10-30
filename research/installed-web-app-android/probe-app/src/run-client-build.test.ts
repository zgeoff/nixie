import { expect, test } from 'bun:test';
import { runClientBuild } from './run-client-build.ts';

test('it bundles the service worker at the root and each page under assets', async () => {
  const assets = await runClientBuild();

  expect([...assets.keys()].toSorted()).toStrictEqual([
    'assets/block-1.js',
    'assets/block-2.js',
    'assets/block-6.js',
    'assets/block-7.js',
    'assets/home.js',
    'assets/log.js',
    'assets/send.js',
    'sw.js',
  ]);
  // a classic service worker script cannot hold an import
  expect(await assets.get('sw.js')?.text()).not.toMatch(/^import /m);
});
