import { expect, test } from 'bun:test';
import { collectDueStatusRecords } from './collect-due-status-records';
import type { WatchedConnection } from './collect-due-status-records';

function setupTest() {
  const day = 86_400_000;

  const watched: WatchedConnection = {
    connection: 'conn-1',
    status: 'failing',
    sinceMs: 0,
    endsAtMs: null,
    isStored: true,
  };

  return {
    day,
    watched,
    collect: (
      connection: WatchedConnection,
      written: Parameters<typeof collectDueStatusRecords>[1],
    ) => collectDueStatusRecords([connection], written, { nowMs: 3 * day, noticeMs: 2 * day }),
    none: { reached: [], lasted: [] },
  };
}

test('it owes one record for a break that passed the notice time', () => {
  const ctx = setupTest();

  expect(ctx.collect(ctx.watched, ctx.none)).toStrictEqual([
    { kind: 'lasted', key: { connection: 'conn-1', sinceMs: 0 } },
  ]);
});

test('it owes nothing for a break that already has its record', () => {
  const ctx = setupTest();

  const due = ctx.collect(ctx.watched, {
    reached: [],
    lasted: [{ connection: 'conn-1', sinceMs: 0 }],
  });

  expect(due).toStrictEqual([]);
});

test('it owes a new record for a later break of the same connection', () => {
  const ctx = setupTest();

  const due = ctx.collect(
    { ...ctx.watched, sinceMs: ctx.day / 2 },
    { reached: [], lasted: [{ connection: 'conn-1', sinceMs: 0 }] },
  );

  expect(due).toStrictEqual([
    { kind: 'lasted', key: { connection: 'conn-1', sinceMs: ctx.day / 2 } },
  ]);
});

test('it owes nothing for a break shorter than the notice time', () => {
  const ctx = setupTest();

  expect(ctx.collect({ ...ctx.watched, sinceMs: 2 * ctx.day }, ctx.none)).toStrictEqual([]);
});

test('it owes a record when the clock alone takes a connection into expiring', () => {
  const ctx = setupTest();

  const due = ctx.collect(
    {
      ...ctx.watched,
      status: 'expiring',
      sinceMs: 2.9 * ctx.day,
      endsAtMs: 5.9 * ctx.day,
      isStored: false,
    },
    ctx.none,
  );

  expect(due).toStrictEqual([
    { kind: 'reached', key: { connection: 'conn-1', status: 'expiring', endsAtMs: 5.9 * ctx.day } },
  ]);
});

test('it owes no reached record for a status that the store wrote', () => {
  const ctx = setupTest();

  const due = ctx.collect(
    {
      ...ctx.watched,
      status: 'needs_consent',
      endsAtMs: 1,
      sinceMs: 3 * ctx.day,
    },
    ctx.none,
  );

  expect(due).toStrictEqual([]);
});

test('it owes a reached and a lasted record for a grant that ended more than the notice time ago', () => {
  const ctx = setupTest();

  const due = ctx.collect(
    {
      ...ctx.watched,
      status: 'needs_consent',
      sinceMs: 0,
      endsAtMs: 0,
      isStored: false,
    },
    ctx.none,
  );

  expect(due.map((record) => record.kind)).toStrictEqual(['reached', 'lasted']);
});
