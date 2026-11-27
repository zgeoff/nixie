import { expect, onTestFinished, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import { inboxKinds } from './inbox-kinds';
import { isInboxRecord } from './is-inbox-record';
import { isWakingRecord } from './is-waking-record';

function setupTest() {
  onTestFinished(() => {
    inboxKinds.set([]);
  });

  return {
    kinds: [
      { kind: 'ops.started', wakes: () => false, render: () => 'started' },
      {
        kind: 'ops.closed',
        wakes: (payload: JSONObject) => payload['by'] === 'expired',
        render: () => 'closed',
      },
    ],
  };
}

test.each([
  { title: 'a kind that a feature added is in the inbox', kind: 'ops.started', isInbox: true },
  { title: 'a kind that no feature added is out of the inbox', kind: 'ops.other', isInbox: false },
])('it reads $title', (row) => {
  const ctx = setupTest();

  inboxKinds.set(ctx.kinds);

  // @ts-expect-error -- tasks depends on no feature, so it does not see the kind that a feature adds
  expect(isInboxRecord({ kind: row.kind, thread: 'conversation' })).toBe(row.isInbox);
});

test('it leaves a kind out of the inbox once the list holds none', () => {
  const ctx = setupTest();

  inboxKinds.set(ctx.kinds);
  inboxKinds.set([]);

  // @ts-expect-error -- tasks depends on no feature, so it does not see the kind that a feature adds
  expect(isInboxRecord({ kind: 'ops.started', thread: 'conversation' })).toBe(false);
});

test.each([
  { title: 'a kind that never wakes', kind: 'ops.started', payload: {}, wakes: false },
  {
    title: 'a kind that wakes on its payload',
    kind: 'ops.closed',
    payload: { by: 'expired' },
    wakes: true,
  },
  {
    title: 'a kind that stays quiet on its payload',
    kind: 'ops.closed',
    payload: { by: 'user' },
    wakes: false,
  },
])('it lets the feature say whether $title', (row) => {
  const ctx = setupTest();

  inboxKinds.set(ctx.kinds);

  // @ts-expect-error -- tasks depends on no feature, so it does not see the kind that a feature adds
  expect(isWakingRecord({ kind: row.kind, thread: 'conversation', payload: row.payload })).toBe(
    row.wakes,
  );
});

test('it finds a kind by its name, and none that was not added', () => {
  const ctx = setupTest();

  inboxKinds.set(ctx.kinds);

  expect([inboxKinds.byKind('ops.started')?.kind, inboxKinds.byKind('ops.other')]).toStrictEqual([
    'ops.started',
    null,
  ]);
});
