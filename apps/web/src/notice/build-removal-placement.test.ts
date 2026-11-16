import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '../test-utils/build-mock-log-record';
import { buildMockStepActivity } from '../test-utils/build-mock-step-activity';
import { buildRemovalPlacement } from './build-removal-placement';

function setupTest() {
  return {
    firstMessage: {
      kind: 'message' as const,
      record: buildMockLogRecord({ kind: 'owner_message', sequence: 1 }),
    },
    step: buildMockStepActivity({ key: 2 }),
    reply: {
      kind: 'message' as const,
      record: buildMockLogRecord({ kind: 'model.reply', sequence: 8 }),
    },
    nextMessage: {
      kind: 'message' as const,
      record: buildMockLogRecord({ kind: 'owner_message', sequence: 10 }),
    },
    laterReply: {
      kind: 'message' as const,
      record: buildMockLogRecord({ kind: 'model.reply', sequence: 11 }),
    },
    outcome: buildMockLogRecord({
      kind: 'action.outcome',
      sequence: 6,
      removal: { kind: 'tool_result', sequence: 4 },
    }),
  };
}

test("it places a removal after the last item of the turn that wrote it, before the owner's next message", () => {
  const ctx = setupTest();

  const placement = buildRemovalPlacement(
    [ctx.firstMessage, ctx.step, ctx.reply, ctx.nextMessage],
    [ctx.outcome],
  );

  const placed = [...placement].map(([index, records]) => [
    index,
    records.map((record) => record.sequence),
  ]);

  expect(placed).toStrictEqual([[2, [6]]]);
});

test('it places a removal of the last turn after the last item', () => {
  const ctx = setupTest();
  const placement = buildRemovalPlacement([ctx.firstMessage, ctx.step, ctx.reply], [ctx.outcome]);

  expect([...placement.keys()]).toStrictEqual([2]);
});

test('it places two removals of one turn together, in the order they were written', () => {
  const ctx = setupTest();

  const later = buildMockLogRecord({
    kind: 'action.outcome',
    sequence: 7,
    removal: { kind: 'owner_message', sequence: 1 },
  });

  const placement = buildRemovalPlacement([ctx.firstMessage, ctx.reply], [ctx.outcome, later]);

  const placed = [...placement].map(([index, records]) => [
    index,
    records.map((record) => record.removal.sequence),
  ]);

  expect(placed).toStrictEqual([[1, [4, 1]]]);
});

test('it places no notice for a record that names no removal', () => {
  const ctx = setupTest();

  const placement = buildRemovalPlacement(
    [ctx.firstMessage, ctx.reply],
    [buildMockLogRecord({ kind: 'action.outcome', sequence: 6 })],
  );

  expect([...placement]).toStrictEqual([]);
});

test('it places a removal under the turn of its call when the owner approved it after a later turn', () => {
  const ctx = setupTest();

  const later = buildMockLogRecord({
    kind: 'action.outcome',
    sequence: 12,
    removal: { kind: 'tool_result', sequence: 4, callSequence: 3 },
  });

  const placement = buildRemovalPlacement(
    [ctx.firstMessage, ctx.step, ctx.reply, ctx.nextMessage, ctx.laterReply],
    [later],
  );

  const placed = [...placement].map(([index, records]) => [
    index,
    records.map((record) => record.sequence),
  ]);

  expect(placed).toStrictEqual([[2, [12]]]);
});
