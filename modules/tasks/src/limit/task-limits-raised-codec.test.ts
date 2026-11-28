import { expect, test } from 'bun:test';
import { taskLimitsRaisedCodec } from './task-limits-raised-codec';

test('#encode stores a limit that a task lacks as a number, so the release before reads the record', () => {
  const stored = taskLimitsRaisedCodec.encode({
    taskID: 'k3x9m2p7qa',
    limits: { turns: 40, dollars: null },
  });

  expect(stored).toStrictEqual({
    taskID: 'k3x9m2p7qa',
    limits: { turns: 40, dollars: 1_000_000_000 },
  });
});

test('#decode reads the stored number of a missing limit as null', () => {
  const decoded = taskLimitsRaisedCodec.decode({
    taskID: 'k3x9m2p7qa',
    limits: { turns: 1_000_000_000, dollars: 2.5 },
  });

  expect(decoded).toStrictEqual({ taskID: 'k3x9m2p7qa', limits: { turns: null, dollars: 2.5 } });
});
