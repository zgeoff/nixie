import { expect, test } from 'bun:test';
import { parseRefusalRecord } from './parse-refusal-record';

test('it reads a refusal record', () => {
  expect(
    parseRefusalRecord({
      kind: 'identity.refused',
      payload: { channel: 'client', externalID: 'ab12', refusedAt: 1_000_000 },
    }),
  ).toStrictEqual({ channel: 'client', externalID: 'ab12', refusedAt: 1_000_000 });
});

test('it reads a record of another kind as no refusal', () => {
  expect(
    parseRefusalRecord({
      kind: 'session.revoked',
      payload: { channel: 'client', externalID: 'ab12', refusedAt: 1_000_000 },
    }),
  ).toBeNull();
});

test('it reads a refusal record without its time as no refusal', () => {
  expect(
    parseRefusalRecord({
      kind: 'identity.refused',
      payload: { channel: 'client', externalID: 'ab12' },
    }),
  ).toBeNull();
});
