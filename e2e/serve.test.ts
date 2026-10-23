import { expect, test } from 'bun:test';
import { createTestClient } from '@heynixie/server/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { startSpawnedNixie } from './test-utils/start-spawned-nixie';

test('it answers a message through the real guest and keeps its text out of the data files and the output', async () => {
  const nixie = await startSpawnedNixie();

  const server = nixie.harness.start();

  const api = await createTestClient(server);

  nixie.model.addReplies({ text: 'Quince-reply-4ZT9' });

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Plum-message-7QK2',
    thread: 'conversation',
  });

  // the real guest starts the Agent SDK's CLI cold, which outlasts the default wait on a small host
  await waitForCondition(
    async () => {
      const page = await api.client.conversation.read({ thread: 'conversation' });

      return page.records.some((record) => record.message?.text === 'Quince-reply-4ZT9');
    },
    { timeoutMs: 25_000, intervalMs: 100 },
  );

  server.signal('SIGTERM');

  const run = await server.waitForExit();
  const files = await nixie.readDataFiles();

  expect(run.exit).toStrictEqual({ code: 0, signal: null });
  expect(files.map((file) => file.name)).toIncludeAllMembers(['nixie.db', 'keys.db']);

  expect(
    files.filter((file) => /Plum-message-7QK2|Quince-reply-4ZT9/u.test(file.text)),
  ).toStrictEqual([]);

  expect(server.readOutput()).not.toMatch(/Plum-message-7QK2|Quince-reply-4ZT9/u);
  expect(server.readOutput()).toInclude('"event":"stopped"');
});

test('it completes a turn that calls a tool from the test sandbox the configuration selects', async () => {
  const nixie = await startSpawnedNixie();

  const server = nixie.harness.start();

  const api = await createTestClient(server);

  nixie.model.addReplies(
    { toolUse: { name: 'mcp__nixie__time_now', input: {} } },
    { text: 'It is just past noon in Reykjavik.' },
  );

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'What time is it in Reykjavik?',
    thread: 'conversation',
    timeZone: 'Atlantic/Reykjavik',
  });

  // the real guest starts the Agent SDK's CLI cold, which outlasts the default wait on a small host
  await waitForCondition(
    async () => {
      const page = await api.client.conversation.read({ thread: 'conversation' });

      return page.records.some((record) => /^task\.step_(?:committed|errored)$/u.test(record.kind));
    },
    { timeoutMs: 25_000, intervalMs: 100 },
  );

  const page = await api.client.conversation.read({ thread: 'conversation' });
  const sandboxIDs = await nixie.readSandboxIDs();

  expect(sandboxIDs.length).toBeGreaterThan(0);
  expect(page.records.at(-1)?.kind).toBe('task.step_committed');

  expect(page.records.find((record) => record.kind === 'tool_result')?.toolCall).toMatchObject({
    outcome: 'result',
    content: { result: { timeZone: 'Atlantic/Reykjavik' } },
  });

  expect(JSON.stringify(nixie.model.requests.at(-1)?.body?.messages)).toMatch(
    /"type":"tool_result".*Atlantic\/Reykjavik/u,
  );
});

test('it refuses to start on a key no module reads, and exits 1', async () => {
  const nixie = await startSpawnedNixie({ extraConfig: ['tasks:', '  runner: 5'] });

  const server = nixie.harness.start();

  const exit = await server.exited;
  const failure = await server.waitForLogEvent('command.failed');

  expect(exit).toStrictEqual({ code: 1, signal: null });

  expect(failure).toMatchObject({
    command: 'serve',
    message: expect.toInclude('tasks: Unrecognized key: "runner"'),
  });
});
