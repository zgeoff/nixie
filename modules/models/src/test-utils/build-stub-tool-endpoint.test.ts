import { expect, test } from 'bun:test';
import { buildStubToolEndpoint } from './build-stub-tool-endpoint';

test('it records each run it starts and hands back its token', async () => {
  const stub = buildStubToolEndpoint();
  const run = {
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
    runID: 'conversation',
    thread: 'conversation',
    tools: ['notes_read'],
    model: { model: 'claude-test-1', profile: 'chat-direct' },
  });

  const first = endpoint.startStep('conversation:1@1');
  const second = endpoint.startStep('conversation:2@2');

  await first.stop();

  expect(first.token).toBe('step-token-1');
  expect(second.token).toBe('step-token-2');
  expect(stub.steps).toStrictEqual([
    { stepRunID: 'conversation:1@1', token: 'step-token-1', isStopped: true },
    { stepRunID: 'conversation:2@2', token: 'step-token-2', isStopped: false },
  ]);
});
