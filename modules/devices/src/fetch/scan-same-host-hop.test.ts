import { expect, test } from 'bun:test';
import type { HopVerdict } from '@heynixie/connectors';
import { scanSameHostHop } from './scan-same-host-hop';

function setupTest() {
  return {
    scanURL: (url: string): string | null =>
      url.includes('sk-secret') ? 'the URL holds a secret' : null,
  };
}

test.each<[string, HopVerdict]>([
  ['https://tides.example/other', { kind: 'pass' }],
  [
    'https://elsewhere.example/other',
    { kind: 'refuse', reason: 'the fetch of tides.example redirected to another host' },
  ],
  [
    'http://tides.example/other',
    { kind: 'refuse', reason: 'the fetch of tides.example redirected to a URL that is not https' },
  ],
  [
    'https://tides.example/other?key=sk-secret',
    { kind: 'refuse', reason: 'the URL holds a secret' },
  ],
])('#scanSameHostHop judges the redirect to %s', (url, expected) => {
  const ctx = setupTest();

  expect(scanSameHostHop({ url, host: 'tides.example' }, ctx.scanURL)).toStrictEqual(expected);
});
