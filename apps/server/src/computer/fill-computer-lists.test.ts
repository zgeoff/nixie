import { expect, onTestFinished, test } from 'bun:test';
import { buildAlwaysAllowRule, toolShapes } from '@heynixie/policy';
import { inboxKinds, isInboxRecord, isWakingRecord } from '@heynixie/tasks';
import { fillComputerLists } from './fill-computer-lists';

function setupTest() {
  // the policy's test preload installs the computer's shapes before each test, so a server that has
  // filled nothing starts with none
  toolShapes.set([]);

  onTestFinished(() => {
    inboxKinds.set([]);
    toolShapes.set([]);
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
    runFacts: {
      shortID: 'ab12',
      tool: 'computer.run',
      input: { command: 'ls -la' },
      destinations: [],
      content: [],
    },
  };
}

test('it adds the take-over and handover records to the inbox when the computer is on', () => {
  const ctx = setupTest();

  fillComputerLists({ computer: {} });

  expect({
    asked: isInboxRecord(ctx.handoverAsked),
    wakesOnAsk: isWakingRecord(ctx.handoverAsked),
    wakesOnExpiry: isWakingRecord(ctx.handoverExpired),
  }).toStrictEqual({ asked: true, wakesOnAsk: false, wakesOnExpiry: true });
});

test('it leaves the take-over and handover records out of the inbox when the computer is off', () => {
  const ctx = setupTest();

  fillComputerLists({ computer: {} });
  fillComputerLists({});

  expect({
    asked: isInboxRecord(ctx.handoverAsked),
    kind: inboxKinds.byKind('computer.takeover_started'),
  }).toStrictEqual({ asked: false, kind: null });
});

test('it gives the command tool an always-allow rule that pins the command when the computer is on', () => {
  const ctx = setupTest();

  fillComputerLists({ computer: {} });

  expect(buildAlwaysAllowRule(ctx.runFacts)?.form.checks).toStrictEqual([
    { arg: 'command', op: 'matches', value: expect.any(String) },
  ]);
});

test('it lists no tool shape when the computer is off', () => {
  setupTest();
  fillComputerLists({ computer: {} });
  fillComputerLists({});

  expect(toolShapes.list()).toStrictEqual([]);
});
