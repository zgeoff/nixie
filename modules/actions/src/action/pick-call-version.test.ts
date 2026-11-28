import { expect, test } from 'bun:test';
import { pickCallVersion } from './pick-call-version';

test('it carries the pin and the declaration snapshot the call was decided on', () => {
  expect(pickCallVersion({ pinHash: 'pin-1', definitionsHash: 'snapshot-1' })).toStrictEqual({
    pinHash: 'pin-1',
    definitionsHash: 'snapshot-1',
  });
});

test('it carries no field the call record lacks', () => {
  expect(pickCallVersion({})).toStrictEqual({});
});
