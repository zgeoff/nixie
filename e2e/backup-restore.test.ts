import { expect, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { ContractClient } from '@heynixie/contract';
import { clientHeaderName } from '@heynixie/contract';
import { pendingRestoreSchema } from '@heynixie/log';
import {
  createTestClient,
  runHostCommand,
  sendClientMessage,
  startSpawnedNixie,
} from '@heynixie/server/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { z } from 'zod';

test('it backs up a running server and restores it into an empty data directory through the nixie executable, and the restarted server starts paused and takes no step until nixie resumes', async () => {
  const nixie = await startSpawnedNixie();

  const server = nixie.harness.start();

  const api = await createTestClient(server);

  nixie.model.addReplies({ text: 'Quince-reply-4ZT9' });

  // The turn starts the real SDK in a guest process, which outlasts the helper's default wait on
  // a busy host.
  await sendClientMessage(api.client, { text: 'Plum-message-7QK2' }, 'Quince-reply-4ZT9', {
    timeoutMs: 30_000,
  });

  const created = await server.request('createTask', { brief: 'Wait an hour.' });

  const taskID = String(created);

  await nixie.waitForRecord((record) => record.stepKey === `${taskID}:1`);

  // A conversation step that has started and not committed is a task to check after the restore.
  await server.request('arm', { point: 'step.commit.before', workID: 'conversation' });

  nixie.model.addReplies({ text: 'Lime-reply-2VB6' });
  void server.request('sendMessage', { thread: 'conversation', text: 'Lime-message-9HD4' });

  await server.waitForArrival('step.commit.before');

  const target = join(nixie.directory, 'backup');

  const backup = await runHostCommand(nixie.configPath, ['backup', '--to', target]);

  await server.kill();

  await rm(nixie.dataDir, { recursive: true, force: true });
  await mkdir(nixie.dataDir);

  const restore = await runHostCommand(nixie.configPath, ['restore', '--from', target, '--yes']);
  const marker = await Bun.file(join(nixie.dataDir, 'restore-incomplete')).text();

  const pending = pendingRestoreSchema.parse(JSON.parse(marker));
  const restarted = nixie.harness.start();

  const listening = await restarted.waitForLogEvent('http.listening');

  await restarted.ready;

  const markerFile = Bun.file(join(nixie.dataDir, 'restore-incomplete'));

  const isMarkerPresent = await markerFile.exists();
  const started = await nixie.waitForRecord((record) => record.kind === 'recovery.started');
  const restartedRecords = await nixie.readRecords();
  const recovery = await runHostCommand(nixie.configPath, ['recovery']);

  expect(backup.exitCode).toBe(0);
  expect(backup.stdout).toStartWith('copied nixie.db\ncopied keys.db\n');
  expect(backup.stdout).toInclude(`nixie backed up nixie.db and keys.db into ${target} in `);
  expect(restore.exitCode).toBe(0);
  expect(restore.stdout).toInclude(`nixie restored nixie.db and keys.db from ${target}\n`);
  expect(isMarkerPresent).toBeFalse();
  expect(restarted.readOutput()).not.toInclude('holds a finished restore');
  expect(restartedRecords.filter((record) => record.kind === 'recovery.started')).toHaveLength(1);
  expect(started.payload['recoveryID']).toBe(pending.recoveryID);
  expect(recovery.exitCode).toBe(0);

  const checkedTaskSchema = z.object({ taskID: z.string(), name: z.string() });
  const checkedSchema = z.object({ toCheck: z.array(checkedTaskSchema) });
  const recoverySchema = z.object({ recovery: checkedSchema });
  const recordedTaskSchema = z.object({ taskID: z.string() });
  const startedSchema = z.object({ toCheck: z.array(recordedTaskSchema) });
  const checked = recoverySchema.parse(JSON.parse(recovery.stdout));
  const recorded = startedSchema.parse(started.payload);

  const expected = recorded.toCheck.map((task) => ({
    taskID: task.taskID,
    name: task.taskID === 'conversation' ? 'Conversation' : task.taskID,
  }));

  expect(checked.recovery.toCheck.length).toBeGreaterThan(0);
  expect(checked.recovery.toCheck).toStrictEqual(expected);

  expect(
    restartedRecords
      .filter((record) => record.kind === 'nixie.paused')
      .map((record) => record.payload),
  ).toStrictEqual([{ cause: 'restore', recoveryID: pending.recoveryID, by: null }]);

  await nixie.harness.advance(3_700_000);
  await restarted.request('sendMessage', { thread: 'conversation', text: 'Pear-message-5LW1' });

  const fired = await nixie.waitForRecord((record) => record.kind === 'timer.fired');

  const message = await nixie.waitForRecord(
    (record) => record.kind === 'owner_message' && record.sequence > started.sequence,
  );

  await nixie.harness.advance(1, { settle: true });

  const waitingRecords = await nixie.readRecords();

  expect(
    waitingRecords.filter(
      (record) =>
        record.sequence > started.sequence &&
        (record.kind === 'task.step_started' || record.kind === 'test.inbox_read'),
    ),
  ).toStrictEqual([]);

  nixie.model.addReplies({ text: 'Fig-reply-8RD3' });

  const resume = await runHostCommand(nixie.configPath, ['resume']);

  expect(resume.exitCode).toBe(0);

  const resumed = await nixie.waitForRecord((record) => record.kind === 'nixie.resumed');

  const timerStep = await nixie.waitForRecord(
    (record) =>
      record.kind === 'test.inbox_read' &&
      record.payload['taskID'] === taskID &&
      Array.isArray(record.payload['sequences']) &&
      record.payload['sequences'].includes(fired.sequence),
  );

  // The restored key store keeps the device session that enrolled before the backup.
  const restoredClient = createORPCClient<ContractClient>(
    new RPCLink({
      url: `http://127.0.0.1:${String(listening['port'])}/rpc`,
      headers: { [clientHeaderName]: 'test', authorization: `Bearer ${api.token}` },
    }),
  );

  // The turn starts the real SDK in a guest process, which outlasts the helper's default wait on
  // a busy host.
  await waitForCondition(
    async () => {
      const page = await restoredClient.conversation.read({ thread: 'conversation' });

      return page.records.some(
        (record) =>
          record.kind === 'model.reply' &&
          record.sequence > message.sequence &&
          record.message?.text === 'Fig-reply-8RD3',
      );
    },
    { timeoutMs: 30_000 },
  );

  expect(timerStep.sequence).toBeGreaterThan(resumed.sequence);
});
