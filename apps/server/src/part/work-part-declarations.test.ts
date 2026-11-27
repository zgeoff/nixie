import { expect, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { z } from 'zod';
import { createTestClient } from '../test-utils/create-test-client';
import { runHostCommand } from '../test-utils/run-host-command';
import type { HeldTasks } from '../test-utils/seed-held-tasks';
import { sendClientMessage } from '../test-utils/send-client-message';
import { startInProcessNixie } from '../test-utils/start-in-process-nixie';

test('it logs a skill export that fails at the error level', async () => {
  // nothing listens on the discard port, so the export's first request fails
  const nixie = await startInProcessNixie({
    extraDefinitions: [
      'export: { repository: harbour/definitions, api_url: "https://127.0.0.1:9" }',
    ],
    extraSecrets: ['definitions_export_token: token-a'],
  });

  const clients = await createTestClient(nixie);

  nixie.guest.addReplies(
    {
      toolUse: {
        name: 'skill_write',
        input: {
          name: 'tide-tables',
          files: [
            {
              path: 'SKILL.md',
              text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
            },
          ],
        },
      },
    },
    { text: 'Proposed.' },
  );

  await sendClientMessage(
    clients.client,
    { text: 'Write a skill for reading tide tables.' },
    'Proposed.',
  );

  const listed = await runHostCommand(nixie.configPath, ['skill-pending']);

  const [{ proposalID, skillHash }] = z
    .tuple([z.object({ proposalID: z.string(), skillHash: z.string() })])
    .parse(JSON.parse(listed.stdout));

  await runHostCommand(nixie.configPath, ['skill-approve', proposalID, '--hash', skillHash]);

  const failed = await nixie.waitForLogEvent('definitions.export_failed');

  expect(failed).toMatchObject({ level: 'error' });
});

test('it runs a held started task at server start, and leaves a held task that the user paused paused', async () => {
  const seeded = Promise.withResolvers<HeldTasks>();

  const nixie = await startInProcessNixie({
    roleModelURLs: { task: 'http://127.0.0.1:4040' },
    beforeStart: async (_files, seed) => {
      const held = await seed.heldTasks();

      seeded.resolve(held);
    },
  });

  const held = await seeded.promise;
  const revived = await nixie.waitForLogEvent('tasks.held_revived');

  await waitForCondition(() =>
    nixie.guest.received.some((received) => received.owner === held.heldID),
  );

  const paused = nixie.guest.received.filter((received) => received.owner === held.pausedID);

  expect(revived['tasks']).toBe(1);
  expect(paused).toStrictEqual([]);
});

test('it claims no call task at server start while the config has no voice section', async () => {
  const seeded = Promise.withResolvers<{ readonly held: HeldTasks; readonly callTaskID: string }>();

  const nixie = await startInProcessNixie({
    roleModelURLs: { task: 'http://127.0.0.1:4040' },
    beforeStart: async (_files, seed) => {
      const callTaskID = await seed.callTask();
      const held = await seed.heldTasks();

      seeded.resolve({ held, callTaskID });
    },
  });

  const tasks = await seeded.promise;

  // the held task is claimed by a pool that runs beside the one that would claim the call task
  await waitForCondition(() =>
    nixie.guest.received.some((received) => received.owner === tasks.held.heldID),
  );

  nixie.signalStop();

  const exited = await nixie.waitForExit();

  expect(
    exited.records.filter(
      (record) => record.thread === tasks.callTaskID && record.kind !== 'task.created',
    ),
  ).toStrictEqual([]);
});
