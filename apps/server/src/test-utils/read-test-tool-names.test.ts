import { expect, test } from 'bun:test';
import { buildTestNotesTools } from './build-test-notes-tools';
import { readTestToolNames } from './read-test-tool-names';
import { startTestServer } from './start-test-server';

test('it reads the names of the tools a run endpoint offers to the run token', async () => {
  const notes = buildTestNotesTools('Water the ferns.');

  const server = await startTestServer(notes.tools);

  const run = await server.endpoint.startRun({
    runID: 'conversation',
    thread: 'conversation',
    tools: ['notes_read'],
    model: { model: 'claude-test-1', profile: 'chat-direct' },
  });

  const names = await readTestToolNames({ target: run.target, token: run.token });

  expect(names).toStrictEqual(['notes_read']);
});
