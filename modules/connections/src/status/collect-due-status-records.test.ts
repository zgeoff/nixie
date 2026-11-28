import { expect, test } from 'bun:test';
import { collectDueStatusRecords } from './collect-due-status-records';
import type { WatchedConnection } from './collect-due-status-records';
import type { StatusStep } from './collect-status-events';

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
    buildStep: (sequence: number, atMs: number, step: StatusStep['step']): StatusStep => ({
      sequence,
      atMs,
      connection: 'conn-1',
      step,
    }),
    collect: (connection: WatchedConnection, steps: readonly StatusStep[]) =>
      collectDueStatusRecords([connection], steps, { nowMs: 3 * day, noticeMs: 2 * day }),
  };
}

test('it owes one record for a break that passed the notice time', () => {
  const ctx = setupTest();

  expect(ctx.collect(ctx.watched, [])).toStrictEqual([
    { kind: 'lasted', key: { connection: 'conn-1', sinceMs: 0 } },
  ]);
});

test('it owes nothing for a break that already has its record, however long ago', () => {
  const ctx = setupTest();

  const due = ctx.collect(ctx.watched, [
    ctx.buildStep(1, 0, { kind: 'failing', reason: 'no_answer' }),
    ctx.buildStep(2, 2 * ctx.day, { kind: 'lasted', sinceMs: 0 }),
  ]);

  expect(due).toStrictEqual([]);
});

test('it dates a break from its first failing step, not from the status time that a retry moved', () => {
  const ctx = setupTest();

  const due = ctx.collect({ ...ctx.watched, sinceMs: 2.5 * ctx.day }, [
    ctx.buildStep(1, 0, { kind: 'failing', reason: 'no_answer' }),
  ]);

  expect(due).toStrictEqual([{ kind: 'lasted', key: { connection: 'conn-1', sinceMs: 0 } }]);
});

test('it dates a break from the end of the grant when the store marked it as needing consent later', () => {
  const ctx = setupTest();

  const due = ctx.collect(
    { ...ctx.watched, status: 'needs_consent', sinceMs: 0.5 * ctx.day, endsAtMs: 0.5 * ctx.day },
    [ctx.buildStep(1, 1.5 * ctx.day, { kind: 'needs_consent' })],
  );

  expect(due).toStrictEqual([
    { kind: 'lasted', key: { connection: 'conn-1', sinceMs: 0.5 * ctx.day } },
  ]);
});

test('it owes one record for the whole break when it moves from failing to needing consent', () => {
  const ctx = setupTest();

  const due = ctx.collect({ ...ctx.watched, status: 'needs_consent', sinceMs: 2.5 * ctx.day }, [
    ctx.buildStep(1, 0, { kind: 'failing', reason: 'no_answer' }),
    ctx.buildStep(2, 2.5 * ctx.day, { kind: 'needs_consent' }),
    ctx.buildStep(3, 2.6 * ctx.day, { kind: 'lasted', sinceMs: 0 }),
  ]);

  expect(due).toStrictEqual([]);
});

test('it owes a new record for a later break of the same connection', () => {
  const ctx = setupTest();

  const due = ctx.collect({ ...ctx.watched, sinceMs: 0.5 * ctx.day }, [
    ctx.buildStep(1, 0, { kind: 'failing', reason: null }),
    ctx.buildStep(2, 2 * ctx.day, { kind: 'lasted', sinceMs: 0 }),
    ctx.buildStep(3, 2.1 * ctx.day, { kind: 'active' }),
    ctx.buildStep(4, 0.5 * ctx.day, { kind: 'failing', reason: null }),
  ]);

  expect(due).toStrictEqual([
    { kind: 'lasted', key: { connection: 'conn-1', sinceMs: 0.5 * ctx.day } },
  ]);
});

test('it owes nothing for a break shorter than the notice time', () => {
  const ctx = setupTest();

  expect(ctx.collect({ ...ctx.watched, sinceMs: 2 * ctx.day }, [])).toStrictEqual([]);
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
    [],
  );

  expect(due).toStrictEqual([
    { kind: 'reached', key: { connection: 'conn-1', status: 'expiring', endsAtMs: 5.9 * ctx.day } },
  ]);
});

test('it owes no reached record for a status that the store wrote', () => {
  const ctx = setupTest();

  const due = ctx.collect(
    { ...ctx.watched, status: 'needs_consent', endsAtMs: 1, sinceMs: 3 * ctx.day },
    [],
  );

  expect(due).toStrictEqual([]);
});

test('it owes a reached record for a grant that ended while the connection was failing', () => {
  const ctx = setupTest();

  const due = ctx.collect(
    {
      ...ctx.watched,
      status: 'needs_consent',
      sinceMs: 2.9 * ctx.day,
      endsAtMs: 2.9 * ctx.day,
      isStored: false,
    },
    [ctx.buildStep(1, 2.8 * ctx.day, { kind: 'failing', reason: 'no_answer' })],
  );

  expect(due.map((record) => record.kind)).toStrictEqual(['reached']);
});

test('it owes a reached record once, and again after a reconnect gave a new grant', () => {
  const ctx = setupTest();

  const expiring = {
    ...ctx.watched,
    status: 'expiring',
    endsAtMs: 5 * ctx.day,
    isStored: false,
  } as const;

  const once = ctx.collect(expiring, [ctx.buildStep(1, 2 * ctx.day, { kind: 'expiring' })]);

  const again = ctx.collect(expiring, [
    ctx.buildStep(1, 2 * ctx.day, { kind: 'expiring' }),
    ctx.buildStep(2, 2.5 * ctx.day, { kind: 'active' }),
  ]);

  expect([once, again.map((record) => record.kind)]).toStrictEqual([[], ['reached']]);
});

test('it owes a reached and a lasted record for a grant that ended more than the notice time ago', () => {
  const ctx = setupTest();

  const due = ctx.collect(
    { ...ctx.watched, status: 'needs_consent', sinceMs: 0, endsAtMs: 0, isStored: false },
    [],
  );

  expect(due.map((record) => record.kind)).toStrictEqual(['reached', 'lasted']);
});
