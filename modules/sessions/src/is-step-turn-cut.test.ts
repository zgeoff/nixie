import { expect, test } from 'bun:test';
import { modelTurnEndedCodec } from '@heynixie/models';
import { isStepTurnCut } from './is-step-turn-cut';

test.each([
  {
    name: 'an interrupted turn that stopped at tool_use',
    buildInterrupt: () => AbortSignal.abort(),
    outcome: 'interrupted',
    stopReason: 'tool_use',
    isCut: true,
  },
  {
    name: 'an interrupted turn that stopped with no reason',
    buildInterrupt: () => AbortSignal.abort(),
    outcome: 'interrupted',
    stopReason: null,
    isCut: true,
  },
  {
    name: 'a turn the interrupt reached after its end_turn',
    buildInterrupt: () => AbortSignal.abort(),
    outcome: 'finished',
    stopReason: 'end_turn',
    isCut: false,
  },
  {
    name: 'a turn no interrupt reached',
    buildInterrupt: () => new AbortController().signal,
    outcome: 'interrupted',
    stopReason: 'tool_use',
    isCut: false,
  },
])('it reads $name as cut: $isCut', (row) => {
  expect(
    isStepTurnCut(row.buildInterrupt(), [
      {
        kind: modelTurnEndedCodec.kind,
        definitions: { snapshotHash: 'sha256:test' },
        payload: modelTurnEndedCodec.encode({
          model: 'claude-test',
          profile: 'task-direct',
          outcome: row.outcome,
          stopReason: row.stopReason,
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
  ).toBe(row.isCut);
});

test('it reads an interrupted step that ran no turn as no cut', () => {
  expect(isStepTurnCut(AbortSignal.abort(), [])).toBeFalse();
});
