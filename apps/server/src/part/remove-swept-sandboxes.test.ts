import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeRecords } from '@heynixie/log';
import { buildSandboxRecorder } from '@heynixie/sandbox';
import { buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { checkerOwner } from '@heynixie/sessions';
import { conversationTaskID, taskCreatedCodec } from '@heynixie/tasks';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { createFakeClock } from '@zgeoff/testing/clock';
import { startDataLog } from '../test-utils/start-data-log';
import { removeSweptSandboxes } from './remove-swept-sandboxes';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-restart-sweep-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  const keyBytes = crypto.getRandomValues(new Uint8Array(32));

  const data = await startDataLog({
    dataDir,
    deploymentKey: Buffer.from(keyBytes).toString('base64'),
    clock: createFakeClock({ startMs: 1_000_000 }),
  });

  onTestFinished(() => data.writer.stop());

  const context = data.context;
  const recorder = buildSandboxRecorder({ log: context.log, definitions: context.definitions });
  const destroyed: string[] = [];

  const adapter = {
    id: 'stub',
    list: async (owner: string) => {
      const rows = await recorder.list('stub', owner);

      return rows.map((row) => ({
        id: row.sandboxID,
        spec: row.spec,
        destroy: () => {
          destroyed.push(row.sandboxID);

          return Promise.resolve();
        },
      }));
    },
  };

  return {
    context,
    adapter,
    destroyed,
    seed: {
      ...buildTaskSeeder({ context }),

      // a started task of an earlier release, whose record names no runner
      unrunnerTask: (taskID: string) =>
        writeRecords(context.log, [
          {
            kind: 'task.created',
            definitions: context.definitions(),
            thread: taskID,
            payload: taskCreatedCodec.encode({
              taskID,
              isConversation: false,
              state: 'ready',
              startedBy: conversationTaskID,
            }),
          },
        ]),
      sandbox: (owner: string, image?: string) =>
        recorder.write({
          event: 'created',
          sandboxID: `sandbox-of-${owner}`,
          adapter: 'stub',
          spec: buildMockSandboxSpec({ owner, ...(image === undefined ? {} : { image }) }),
        }),
    },
  };
}

test('it spares the sandboxes of the conversation, the checker and each open started task, with a stored runner or none, and removes the rest', async () => {
  const ctx = await setupTest();
  const step = await ctx.seed.conversationStep();
  const stored = await ctx.seed.task({ starter: step.claim, name: 'Tide tables', brief: 'Tides.' });
  const closed = await ctx.seed.closedTask({ starter: step.claim, name: 'Moon', brief: 'Moon.' });

  await ctx.seed.unrunnerTask('k3vq8m2xpa');

  await Promise.all(
    [conversationTaskID, checkerOwner, stored, 'k3vq8m2xpa', closed, 'a-stranger'].map((owner) =>
      ctx.seed.sandbox(owner),
    ),
  );

  await removeSweptSandboxes(ctx.context, {
    logger: () => {},
    adapter: ctx.adapter,
    currentImages: [],
    imageExemptOwners: [],
  });

  expect(ctx.destroyed).toIncludeSameMembers([`sandbox-of-${closed}`, 'sandbox-of-a-stranger']);
});

test('it keeps the browser and shell sandboxes of an earlier release on images the manifest no longer lists', async () => {
  const ctx = await setupTest();

  await Promise.all([
    ctx.seed.sandbox('computer-browser', 'nixie-browser-old'),
    ctx.seed.sandbox('computer-shell', 'nixie-shell-old'),
    ctx.seed.sandbox('computer-desktop', 'nixie-computer-old'),
    ctx.seed.sandbox('a-stranger', 'nixie-browser-old'),
  ]);

  await removeSweptSandboxes(ctx.context, {
    logger: () => {},
    adapter: ctx.adapter,
    currentImages: ['nixie-computer-new'],
    imageExemptOwners: [],
  });

  expect(ctx.destroyed).toIncludeSameMembers([
    'sandbox-of-computer-desktop',
    'sandbox-of-a-stranger',
  ]);
});
