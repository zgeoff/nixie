import { expect, test } from 'bun:test';
import { toolCalledCodec } from './tool-called-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = toolCalledCodec.encode({
    callID: 'call-1',
    runID: 'run-1',
    toolUseID: 'toolu_1',
    tool: 'web.fetch',
    model: 'claude-test-1',
    profile: 'chat-direct',
  });

  expect(toolCalledCodec.decode(payload)).toStrictEqual({
    callID: 'call-1',
    runID: 'run-1',
    toolUseID: 'toolu_1',
    tool: 'web.fetch',
    model: 'claude-test-1',
    profile: 'chat-direct',
  });
});

test('it decodes a call from before nixie recorded the model and profile', () => {
  expect(
    toolCalledCodec.decode({
      callID: 'call-1',
      runID: 'run-1',
      toolUseID: null,
      tool: 'web.fetch',
    }),
  ).toStrictEqual({ callID: 'call-1', runID: 'run-1', toolUseID: null, tool: 'web.fetch' });
});

test('it refuses a call that names no tool', () => {
  expect(() =>
    toolCalledCodec.decode({ callID: 'call-1', runID: 'run-1', toolUseID: null }),
  ).toThrow(/"path": \[\s+"tool"\s+\]/u);
});
