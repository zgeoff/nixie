import { expect, test } from 'bun:test';
import { toolResultCodec } from './tool-result-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = toolResultCodec.encode({
    callID: 'call-1',
    runID: 'run-1',
    toolUseID: 'toolu_1',
    outcome: 'queued',
    actionID: 'action-1',
    sources: { message: 'owner_data', page: 'untrusted' },
  });

  expect(toolResultCodec.decode(payload)).toStrictEqual({
    callID: 'call-1',
    runID: 'run-1',
    toolUseID: 'toolu_1',
    outcome: 'queued',
    actionID: 'action-1',
    sources: { message: 'owner_data', page: 'untrusted' },
  });
});

test('it refuses an outcome no call settles as', () => {
  expect(() =>
    toolResultCodec.decode({
      callID: 'call-1',
      runID: 'run-1',
      toolUseID: null,
      outcome: 'pending',
      actionID: null,
      sources: {},
    }),
  ).toThrow(/"path": \[\s+"outcome"\s+\]/u);
});
