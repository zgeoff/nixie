import { expect, test } from 'bun:test';
import { pickRunDelivery } from './pick-run-delivery';

test('it wakes a ready target under wake inside the hop limit', () => {
  expect(
    pickRunDelivery({
      cause: 'reported',
      mode: 'wake',
      targetState: 'waiting',
      hop: 2,
      hopLimit: 6,
      isClosedByTarget: false,
      isDefinitionRun: false,
    }),
  ).toStrictEqual({ delivery: 'wake', isMessageWritten: true });
});

test('it leaves a report for the next turn under next_turn', () => {
  expect(
    pickRunDelivery({
      cause: 'reported',
      mode: 'next_turn',
      targetState: 'waiting',
      hop: 0,
      hopLimit: 6,
      isClosedByTarget: false,
      isDefinitionRun: false,
    }),
  ).toStrictEqual({ delivery: 'next_turn', isMessageWritten: true });
});

test('it leaves a wake report for the next turn once the hop limit is passed', () => {
  expect(
    pickRunDelivery({
      cause: 'limit',
      mode: 'wake',
      targetState: 'waiting',
      hop: 6,
      hopLimit: 6,
      isClosedByTarget: false,
      isDefinitionRun: false,
    }),
  ).toStrictEqual({ delivery: 'next_turn', isMessageWritten: true });
});

test.each([
  ['a task run that ended with no work', 'no_work', 'wake', 'waiting'],
  ['a report mode of none', 'reported', 'none', 'waiting'],
  ['a target that is gone', 'reported', 'wake', null],
  ['a target that is closed', 'reported', 'wake', 'closed'],
  ['a target that is done', 'reported', 'wake', 'done'],
] as const)(
  'it keeps the report of %s and writes no message',
  (_name, cause, mode, targetState) => {
    expect(
      pickRunDelivery({
        cause,
        mode,
        targetState,
        hop: 0,
        hopLimit: 6,
        isClosedByTarget: false,
        isDefinitionRun: false,
      }),
    ).toStrictEqual({
      delivery: 'kept',
      isMessageWritten: false,
    });
  },
);

test.each(['wake', 'next_turn'] as const)(
  'it keeps the report of a close that the target made under %s',
  (mode) => {
    expect(
      pickRunDelivery({
        cause: 'closed',
        mode,
        targetState: 'waiting',
        hop: 0,
        hopLimit: 6,
        isClosedByTarget: true,
        isDefinitionRun: false,
      }),
    ).toStrictEqual({ delivery: 'kept', isMessageWritten: false });
  },
);

test.each([
  {
    name: 'a failed task run of a definition under next_turn',
    facts: { cause: 'failed', mode: 'next_turn', hop: 0, isDefinitionRun: true },
    delivery: 'wake',
  },
  {
    name: 'a failed task run of a definition past the hop limit',
    facts: { cause: 'failed', mode: 'next_turn', hop: 6, isDefinitionRun: true },
    delivery: 'next_turn',
  },
  {
    name: 'a reported task run of a definition under next_turn',
    facts: { cause: 'reported', mode: 'next_turn', hop: 0, isDefinitionRun: true },
    delivery: 'next_turn',
  },
  {
    name: 'a failed started task under next_turn',
    facts: { cause: 'failed', mode: 'next_turn', hop: 0, isDefinitionRun: false },
    delivery: 'next_turn',
  },
  {
    name: 'a failed task run of a definition under none',
    facts: { cause: 'failed', mode: 'none', hop: 0, isDefinitionRun: true },
    delivery: 'kept',
  },
] as const)('it delivers $name', (row) => {
  expect(
    pickRunDelivery({ ...row.facts, targetState: 'waiting', hopLimit: 6, isClosedByTarget: false }),
  ).toStrictEqual({ delivery: row.delivery, isMessageWritten: row.delivery !== 'kept' });
});
