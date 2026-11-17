import { expect, test } from 'bun:test';
import { formatApprovalState } from './format-approval-state';

function setupTest() {
  return {
    buildItem: (state: string, answeredOn: string | null, isAnsweredHere: boolean) => ({
      proposal: { state, deferUntil: null },
      answeredOn,
      isAnsweredHere,
      call: null,
    }),
  };
}

test.each([
  ['approved', 'Approved'],
  ['declined', 'Declined'],
  ['lapsed', 'Lapsed'],
  ['withdrawn', 'Withdrawn'],
])('it names a %s row by its outcome', (state, text) => {
  const ctx = setupTest();

  expect(formatApprovalState(ctx.buildItem(state, null, false))).toBe(text);
});

test('it shows nothing for a pending row', () => {
  const ctx = setupTest();

  expect(formatApprovalState(ctx.buildItem('pending', null, false))).toBeNull();
});

test('it names the device that answered on another device', () => {
  const ctx = setupTest();

  expect(formatApprovalState(ctx.buildItem('approved', 'kitchen tablet', false))).toBe(
    'Approved on kitchen tablet',
  );
});

test('it leaves the device off an answer from this device', () => {
  const ctx = setupTest();

  expect(formatApprovalState(ctx.buildItem('declined', 'laptop', true))).toBe('Declined');
});

test('it shows the return time of a deferred row', () => {
  const item = {
    proposal: { state: 'deferred', deferUntil: new Date('2026-11-16T07:00:00Z') },
    answeredOn: null,
    isAnsweredHere: false,
    call: null,
  };

  expect(formatApprovalState(item)).toStartWith('Deferred until ');
});

test.each([
  [{ state: 'applied', reason: null }, 'Approved, applied'],
  [
    { state: 'failed', reason: 'the harbour office is closed' },
    'Approved, failed: the harbour office is closed',
  ],
  [{ state: 'waiting', reason: null }, 'Approved, waiting to run'],
  [{ state: 'unknown', reason: null }, 'Approved, outcome unknown'],
] as const)('it names an approved row by the call state %o', (call, text) => {
  const item = {
    proposal: { state: 'approved', deferUntil: null },
    answeredOn: null,
    isAnsweredHere: false,
    call,
  };

  expect(formatApprovalState(item)).toBe(text);
});

test('it keeps the device suffix at the end of a call state', () => {
  const item = {
    proposal: { state: 'approved', deferUntil: null },
    answeredOn: 'Kitchen tablet',
    isAnsweredHere: false,
    call: { state: 'applied', reason: null },
  } as const;

  expect(formatApprovalState(item)).toBe('Approved, applied on Kitchen tablet');
});
