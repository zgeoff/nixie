import { expect, test } from 'bun:test';
import { buildTestNotesTools } from './build-test-notes-tools';
import { sendTestToolCall } from './send-test-tool-call';
import { startTestServer } from './start-test-server';

async function setupTest() {
  const notes = buildTestNotesTools('Buy oat milk.');

  const server = await startTestServer(notes.tools);

  const run = await server.endpoint.startRun({
    runID: 'conversation',
    thread: 'conversation',
    tools: ['notes_read'],
    model: { model: 'claude-test-1', profile: 'chat-direct' },
  });

  return { server, run };
}

test('it calls a tool on the run endpoint with the run token and returns its result', async () => {
  const ctx = await setupTest();

  const result = await sendTestToolCall({
    target: ctx.run.target,
    token: ctx.run.token,
    name: 'notes_read',
    input: {},
  });

  expect(result).toInclude('Buy oat milk.');
});

test('it rejects a call that carries a token the endpoint does not know', async () => {
  const ctx = await setupTest();

  expect(
    sendTestToolCall({
      target: ctx.run.target,
      token: 'not-the-token',
      name: 'notes_read',
      input: {},
    }),
  ).rejects.toThrow();
});

test('it rejects a target that is not a Unix socket', () => {
  expect(
    sendTestToolCall({
      target: { host: '127.0.0.1', port: 8901 },
      token: 'token',
      name: 'notes_read',
      input: {},
    }),
  ).rejects.toThrow('the test endpoint listens on a Unix socket');
});
