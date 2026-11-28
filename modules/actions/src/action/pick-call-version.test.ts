import { expect, test } from 'bun:test';
import { pickCallVersion } from './pick-call-version';

test('it carries the version of a first attempt that no approval answered', () => {
  expect(
    pickCallVersion(
      { action: { is_approved: 0 }, attempt: 1 },
      { pinHash: 'pin-1', definitionsHash: 'snapshot-1' },
    ),
  ).toStrictEqual({ pinHash: 'pin-1', definitionsHash: 'snapshot-1' });
});

test('it carries no version for the first attempt of an approved action', () => {
  expect(
    pickCallVersion(
      { action: { is_approved: 1 }, attempt: 1 },
      { pinHash: 'pin-1', definitionsHash: 'snapshot-1' },
    ),
  ).toStrictEqual({});
});

test('it carries the version of a retry of an approved action', () => {
  expect(
    pickCallVersion(
      { action: { is_approved: 1 }, attempt: 2 },
      { pinHash: 'pin-1', definitionsHash: 'snapshot-1' },
    ),
  ).toStrictEqual({ pinHash: 'pin-1', definitionsHash: 'snapshot-1' });
});

test('it carries no field the call record lacks', () => {
  expect(pickCallVersion({ action: { is_approved: 0 }, attempt: 1 }, {})).toStrictEqual({});
});
