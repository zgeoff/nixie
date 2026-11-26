import { expect, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import { pickCheckResponse } from './pick-check-response';

test.each<[string, JSONObject, 'found' | 'not_found']>([
  ['a result with text', { text: 'item 1: water the plants' }, 'found'],
  ['a result with a list that holds an item', { items: [{ id: '1' }] }, 'found'],
  ['a result of blank text', { text: '  \n' }, 'not_found'],
  ['a result with no field', {}, 'not_found'],
  ['a result whose lists and texts are empty', { items: [], note: '', owner: null }, 'not_found'],
])('it counts %s as %s', (_name, result, kind) => {
  expect(pickCheckResponse({ kind: 'answered', outcome: { status: 'ok', result } }).kind).toBe(
    kind,
  );
});

test.each([
  ['a call that was refused', { kind: 'refused', text: 'tracker waits for your approval' }],
  ['a call that failed', { kind: 'failed', text: 'tracker.item_get failed' }],
  ['a tool the proxy does not serve', null],
  ['an error of nixie', { kind: 'answered', outcome: { status: 'error', message: 'no' } }],
  [
    'an error of the server',
    { kind: 'answered', outcome: { status: 'ok', result: { text: 'no item' }, isError: true } },
  ],
] as const)('it counts %s as inconclusive', (_name, result) => {
  expect(pickCheckResponse(result)).toStrictEqual({ kind: 'inconclusive' });
});

test('it counts a result of pictures alone as inconclusive', () => {
  const response = pickCheckResponse({
    kind: 'answered',
    outcome: {
      status: 'ok',
      result: { text: '' },
      images: [{ mediaType: 'image/png', bytes: Buffer.from([1]) }],
    },
  });

  expect(response).toStrictEqual({ kind: 'inconclusive' });
});
