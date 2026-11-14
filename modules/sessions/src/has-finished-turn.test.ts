import { expect, test } from 'bun:test';
import { modelTurnEndedCodec } from '@heynixie/models';
import { hasFinishedTurn } from './has-finished-turn';

test.each([
  ['finished', true],
  ['interrupted', false],
  ['stopped', false],
  ['limit', false],
  ['overflow', false],
] as const)(
  'it reads a turn that ended with the outcome %s as finished: %s',
  (outcome, isFinished) => {
    expect(
      hasFinishedTurn([
        {
          kind: modelTurnEndedCodec.kind,
          definitions: { snapshotHash: 'sha256:test' },
          payload: modelTurnEndedCodec.encode({
            model: 'claude-test',
            profile: 'task-direct',
            outcome,
            stopReason: 'end_turn',
            turns: 1,
            inputTokens: 10,
            outputTokens: 5,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            pinnedCore: [],
            retrieved: [],
            invalidatedThrough: 0,
            sessionImageBytes: 0,
            sessionImageCount: 0,
          }),
        },
      ]),
    ).toBe(isFinished);
  },
);

test('it reads a step with no turn record as unfinished', () => {
  expect(hasFinishedTurn([])).toBeFalse();
});

test('it reads a turn record with no outcome as unfinished, whatever its stop reason', () => {
  expect(
    hasFinishedTurn([
      {
        kind: modelTurnEndedCodec.kind,
        definitions: { snapshotHash: 'sha256:test' },
        payload: { model: 'claude-test', profile: 'task-direct', stopReason: 'end_turn' },
      },
    ]),
  ).toBeFalse();
});
