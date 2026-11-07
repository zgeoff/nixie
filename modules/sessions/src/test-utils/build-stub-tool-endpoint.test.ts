import { expect, test } from 'bun:test';
import { buildStubToolEndpoint } from './build-stub-tool-endpoint';

test('it records each run it starts and hands back its token', async () => {
  const stub = buildStubToolEndpoint();

  const run = {
    toolUseMetaKey: null,
    runID: 'conversation',
    thread: 'conversation',
    tools: ['notes_read'],
    model: { model: 'claude-test-1', profile: 'chat-direct' },
  };

  const endpoint = await stub.endpoint.startRun(run);

  expect(stub.runs).toStrictEqual([run]);
  expect(endpoint).toMatchObject({ runID: 'conversation', token: 'run-token' });
});

test('it numbers each step token a run issues and records which ones stopped', async () => {
  const stub = buildStubToolEndpoint();

  const endpoint = await stub.endpoint.startRun({
    toolUseMetaKey: null,
    runID: 'conversation',
    thread: 'conversation',
    tools: ['notes_read'],
    model: { model: 'claude-test-1', profile: 'chat-direct' },
  });

  const first = endpoint.startStep('conversation:1@1', { key: 'session-a', invalidatedThrough: 0 });
  const second = endpoint.startStep('conversation:2@2');

  await first.stop();

  expect(first.token).toBe('step-token-1');
  expect(second.token).toBe('step-token-2');

  expect(stub.steps).toStrictEqual([
    {
      stepRunID: 'conversation:1@1',
      session: { key: 'session-a', invalidatedThrough: 0 },
      token: 'step-token-1',
      isStopped: true,
    },
    { stepRunID: 'conversation:2@2', session: null, token: 'step-token-2', isStopped: false },
  ]);
});

test('it rejects the first starts it is told to fail, then starts the run', async () => {
  const stub = buildStubToolEndpoint({ failedStarts: 1 });

  const run = {
    toolUseMetaKey: null,
    runID: 'k3vq8m2xpa',
    thread: 'k3vq8m2xpa',
    tools: ['time.now'],
    model: { model: 'claude-test-1', profile: 'chat-direct' },
  };

  const failed = stub.endpoint.startRun(run);

  const started = await stub.endpoint.startRun(run);

  expect(failed).rejects.toThrow('the tool socket could not bind');
  expect(started).toMatchObject({ runID: 'k3vq8m2xpa' });
});
