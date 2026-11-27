import { expect, onTestFinished, test } from 'bun:test';
import { inboxKinds, isInboxRecord, isWakingRecord } from '@heynixie/tasks';
import { fillInboxKinds } from './fill-inbox-kinds';

function setupTest() {
  onTestFinished(() => {
    inboxKinds.set([]);
  });

  return {
    handoverAsked: {
      kind: 'computer.handover_asked' as const,
      thread: 'conversation',
      payload: {},
    },
    handoverExpired: {
      kind: 'computer.handover_closed' as const,
      thread: 'conversation',
      payload: { by: 'expired' },
    },
    handedOff: { kind: 'call.handed_off' as const, thread: 'call-task', payload: {} },
    heardCut: { kind: 'call.heard_cut' as const, thread: 'call-task', payload: {} },
    spoke: { kind: 'call.spoke' as const, thread: 'call-task', payload: {} },
    pageEventKept: {
      kind: 'device.page_event' as const,
      thread: 'conversation',
      payload: { wake: true },
    },
    pageEventUnkept: {
      kind: 'device.page_event' as const,
      thread: 'conversation',
      payload: { wake: false },
    },
  };
}

test('it adds the take-over and handover records to the inbox when the computer is on', () => {
  const ctx = setupTest();

  fillInboxKinds({ computer: {} });

  expect({
    asked: isInboxRecord(ctx.handoverAsked),
    wakesOnAsk: isWakingRecord(ctx.handoverAsked),
    wakesOnExpiry: isWakingRecord(ctx.handoverExpired),
  }).toStrictEqual({ asked: true, wakesOnAsk: false, wakesOnExpiry: true });
});

test('it leaves the take-over and handover records out of the inbox when the computer is off', () => {
  const ctx = setupTest();

  fillInboxKinds({ computer: {} });
  fillInboxKinds({});

  expect({
    asked: isInboxRecord(ctx.handoverAsked),
    kind: inboxKinds.byKind('computer.takeover_started'),
  }).toStrictEqual({ asked: false, kind: null });
});

test('it adds the hand-off of a call to the inbox, and no wake for a cut, when voice is on', () => {
  const ctx = setupTest();

  fillInboxKinds({ voice: {} });

  expect({
    handedOff: isWakingRecord(ctx.handedOff),
    cut: isWakingRecord(ctx.heardCut),
    spoke: isWakingRecord(ctx.spoke),
  }).toStrictEqual({ handedOff: true, cut: false, spoke: false });
});

test('it adds a page event to the inbox only when its wake was kept, when devices are on', () => {
  const ctx = setupTest();

  fillInboxKinds({ devices: {} });

  expect({
    kept: isInboxRecord(ctx.pageEventKept),
    unkept: isInboxRecord(ctx.pageEventUnkept),
  }).toStrictEqual({ kept: true, unkept: false });
});

test('it leaves the page events out of the inbox when devices are off', () => {
  const ctx = setupTest();

  fillInboxKinds({ devices: {} });
  fillInboxKinds({});

  expect({
    kept: isInboxRecord(ctx.pageEventKept),
    kind: inboxKinds.byKind('device.status_changed'),
  }).toStrictEqual({ kept: false, kind: null });
});

test('it leaves the call kinds out of the inbox when voice is off', () => {
  const ctx = setupTest();

  fillInboxKinds({ voice: {} });
  fillInboxKinds({});

  expect({
    kind: inboxKinds.byKind('call.started'),
    handedOff: isInboxRecord(ctx.handedOff),
    spoke: isInboxRecord(ctx.spoke),
  }).toStrictEqual({ kind: null, handedOff: false, spoke: false });
});

test('it keeps the kinds of every feature that is on', () => {
  setupTest();
  fillInboxKinds({ computer: {}, voice: {} });

  expect([
    inboxKinds.byKind('computer.takeover_started') === null,
    inboxKinds.byKind('call.started') === null,
  ]).toStrictEqual([false, false]);
});
