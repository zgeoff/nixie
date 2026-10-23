import { expect, mock, test } from 'bun:test';
import { buildTestNotesTools } from './build-test-notes-tools';
import { startTestServer } from './start-test-server';
import { withTestToolClient } from './with-test-tool-client';

test('it runs the callback with a client connected to the run endpoint and returns its result', async () => {
  const notes = buildTestNotesTools('Fix the gate latch.');

  const server = await startTestServer(notes.tools);

  const run = await server.endpoint.startRun({
    runID: 'conversation',
    thread: 'conversation',
    tools: ['notes_read'],
    model: { model: 'claude-test-1', profile: 'chat-direct' },
  });

  const result = await withTestToolClient(
    { target: run.target, token: run.token },
    async (client) => {
      const listed = await client.listTools();

      return listed.tools.length;
    },
  );

  expect(result).toBe(1);
});

test('it rejects a target that is not a Unix socket and never runs the callback', () => {
  const run = mock(() => Promise.resolve(null));

  expect(
    withTestToolClient({ target: { host: '127.0.0.1', port: 8901 }, token: 'token' }, run),
  ).rejects.toThrow('the test endpoint listens on a Unix socket');

  expect(run).not.toHaveBeenCalled();
});
