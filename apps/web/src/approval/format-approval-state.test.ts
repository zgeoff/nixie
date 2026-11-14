import { expect, test } from 'bun:test';
import { formatApprovalState } from './format-approval-state';

function setupTest() {
  return {
    buildItem: (state: string, answeredOn: string | null, isAnsweredHere: boolean) => ({
      proposal: { state, deferUntil: null },
      answeredOn,
      isAnsweredHere,
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
  };

  expect(formatApprovalState(item)).toStartWith('Deferred until ');
});
