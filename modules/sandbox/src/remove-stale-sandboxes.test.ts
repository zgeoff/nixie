import { expect, test } from 'bun:test';
import { removeStaleSandboxes } from './remove-stale-sandboxes';
import { setupTestRecorder } from './test-utils/setup-test-recorder';
import type { SandboxRecorder } from './types';

// a recorder on a fresh log, and an imp adapter's list over it whose destroy notes each ID
async function setupTest() {
  const ctx = await setupTestRecorder();
  const destroyed: string[] = [];
  const buildAdapter = (recorder: SandboxRecorder) => ({
    id: 'imp',
    list: async (owner: string) => {
      const rows = await recorder.list('imp', owner);

      return rows.map((row) => ({
        destroy: () => {
          destroyed.push(row.sandboxID);
          return Promise.resolve();
        },
      }));
    },
  });

  return { ...ctx, destroyed, adapter: buildAdapter(ctx.recorder) };
}

test('it destroys every sandbox of the adapter whose owner is not kept', async () => {
  const ctx = await setupTest();

  await ctx.writeEvents(
    [
      { sandboxID: 'nixie-a', owner: 'task-1:step-2' },
      { sandboxID: 'nixie-b', owner: 'task-1:step-2' },
      { sandboxID: 'nixie-c', owner: 'web_fetch' },
    ].map((sandbox) => ({
      event: 'created',
      sandboxID: sandbox.sandboxID,
      adapter: 'imp',
      spec: {
        kind: 'worker',
        image: 'worker',
        owner: sandbox.owner,
        egress: { kind: 'none' },
        grants: [],
        toolRoute: true,
        limits: { vcpus: 2, memoryMiB: 2048, diskMiB: 4096 },
      },
    })),
  );

  await removeStaleSandboxes({ log: ctx.log, adapter: ctx.adapter, keptOwners: ['conversation'] });

  expect(ctx.destroyed).toIncludeSameMembers(['nixie-a', 'nixie-b', 'nixie-c']);
});

test('it never destroys a kept owner’s sandbox or another adapter’s', async () => {
  const ctx = await setupTest();

  await ctx.writeEvents([
    {
      event: 'created',
      sandboxID: 'nixie-a',
      adapter: 'imp',
      spec: {
        kind: 'worker',
        image: 'worker',
        owner: 'conversation',
        egress: { kind: 'none' },
        grants: [],
        toolRoute: true,
        limits: { vcpus: 2, memoryMiB: 2048, diskMiB: 4096 },
      },
    },
    {
      event: 'created',
      sandboxID: 'nixie-b',
      adapter: 'process',
      spec: {
        kind: 'worker',
        image: 'worker',
        owner: 'task-1:step-2',
        egress: { kind: 'none' },
        grants: [],
        toolRoute: true,
        limits: { vcpus: 2, memoryMiB: 2048, diskMiB: 4096 },
      },
    },
  ]);

  await removeStaleSandboxes({ log: ctx.log, adapter: ctx.adapter, keptOwners: ['conversation'] });

  expect(ctx.destroyed).toStrictEqual([]);
});
