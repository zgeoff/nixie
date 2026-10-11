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
