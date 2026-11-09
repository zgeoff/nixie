import { expect, test } from 'bun:test';
import { modelTurnEndedCodec } from '@heynixie/models';
import { hasFinishedTurn } from './has-finished-turn';

test.each([
  ['end_turn', true],
  ['tool_use', false],
  [null, false],
])('it reads a turn that stopped with %s as finished: %s', (stopReason, isFinished) => {
  expect(
    hasFinishedTurn([
      {
        kind: modelTurnEndedCodec.kind,
        definitions: { snapshotHash: 'sha256:test' },
        payload: modelTurnEndedCodec.encode({
          model: 'claude-test',
          profile: 'task-direct',
          stopReason,
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
});

test('it reads a step with no turn record as unfinished', () => {
  expect(hasFinishedTurn([])).toBeFalse();
});
