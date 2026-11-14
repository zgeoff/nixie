import { expect, test } from 'bun:test';
import { collectKeyOutputs } from './collect-key-outputs.ts';

test('it keeps the output of each entry named by a key', () => {
  expect(
    collectKeyOutputs(
      JSON.stringify({
        resolve: { outputs: { ref: 'not-a-key' } },
        fetch: { outputs: { ref: 'registry.test/nixie-fetch@sha256:bb22' } },
      }),
      ['conversation', 'fetch'],
      'ref',
    ),
  ).toStrictEqual({ fetch: 'registry.test/nixie-fetch@sha256:bb22' });
});

test('it refuses an entry named by a key that gives no such output', () => {
  expect(() =>
    collectKeyOutputs(JSON.stringify({ fetch: { outputs: {} } }), ['fetch'], 'ref'),
  ).toThrow('fetch gives no ref output');
});
