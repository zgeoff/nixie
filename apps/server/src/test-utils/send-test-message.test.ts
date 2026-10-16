import { expect, mock, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { claimTask, createConversationTask, writeInboxRecords } from '@heynixie/tasks';
import { sendTestMessage } from './send-test-message';
import { startTestServer } from './start-test-server';

test('it runs the conversation step on the message and commits the step result', async () => {
  const server = await startTestServer();

  const runStep = mock(() =>
    Promise.resolve({
      next: 'wait' as const,
      records: [
        {
          kind: 'model.reply' as const,
          definitions: { snapshotHash: 'sha256:test' },
          payload: {},
        },
      ],
      acknowledged: [],
    }),
  );

  await createConversationTask(server.context);
  await sendTestMessage(server.context, runStep, 'Say a fruit.');

  const entries = await readRecords(server.context.log, { afterSequence: 0 });

  expect(runStep).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      inbox: [expect.objectContaining({ kind: 'owner_message', thread: 'conversation' })],
    }),
  );

  expect(
    entries.map((entry) => entry.record).filter((record) => record.kind !== 'task.created'),
  ).toMatchObject([
    { kind: 'owner_message', erasable: { fields: { text: 'Say a fruit.' } } },
    { kind: 'task.step_started' },
    { kind: 'model.reply' },
    { kind: 'task.step_committed' },
  ]);
});

test('it throws when another holder already claimed the conversation task', async () => {
  const server = await startTestServer();

  await createConversationTask(server.context);

  await writeInboxRecords(server.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Hi.' },
    },
  ]);

  await claimTask(server.context, { holder: 'runner-b', leaseMs: 60_000 });

  const sent = sendTestMessage(server.context, mock(), 'Say a fruit.');

  // the send writes through the writer, so it settles before the test stops the writer
  await sent.catch(() => {});

  expect(sent).rejects.toThrowWithMessage(Error, 'the conversation had no work to claim');
});
