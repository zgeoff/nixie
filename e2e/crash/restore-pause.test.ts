import { expect, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { runHostCommand, runOracle, startSpawnedNixie } from '@heynixie/server/test-utils';

async function setupTest() {
  const nixie = await startSpawnedNixie();

  return { nixie, markerPath: join(nixie.dataDir, 'restore-incomplete') };
}

test.each([
  ['recovery.pause.committed', true],
  ['recovery.pause.marker_cleared', false],
])(
  'it starts paused after a kill at %s, takes no step until nixie resumes, and pauses nothing again on a later start',
  async (point, isMarkerLeft) => {
    const ctx = await setupTest();

    const first = ctx.nixie.harness.start();

    await first.ready;

    const created = await first.request('createTask', { brief: 'Wait an hour.' });

    const taskID = String(created);

    await ctx.nixie.waitForRecord((record) => record.stepKey === `${taskID}:1`);

    const target = join(ctx.nixie.directory, 'backup');

    await runHostCommand(ctx.nixie.configPath, ['backup', '--to', target]);

    await first.sendStopSignal();
    await first.waitForExit();

    await rm(ctx.nixie.dataDir, { recursive: true, force: true });
    await mkdir(ctx.nixie.dataDir);
    await runHostCommand(ctx.nixie.configPath, ['restore', '--from', target, '--yes']);

    const killed = ctx.nixie.harness.start([{ point }]);

    await killed.waitForArrival(point);
    await killed.kill();

    const isMarkerPresentAfterKill = await Bun.file(ctx.markerPath).exists();

    const second = ctx.nixie.harness.start();

    await second.ready;

    const isMarkerPresentAfterStart = await Bun.file(ctx.markerPath).exists();
    const started = await ctx.nixie.waitForRecord((record) => record.kind === 'recovery.started');

    await ctx.nixie.harness.advance(3_700_000);

    const fired = await ctx.nixie.waitForRecord((record) => record.kind === 'timer.fired');

    await ctx.nixie.harness.advance(1, { settle: true });

    const waitingRecords = await ctx.nixie.readRecords();

    await second.request('resumeNixie', null);

    const resumed = await ctx.nixie.waitForRecord((record) => record.kind === 'nixie.resumed');

    const step = await ctx.nixie.waitForRecord(
      (record) =>
        record.kind === 'test.inbox_read' &&
        record.payload['taskID'] === taskID &&
        Array.isArray(record.payload['sequences']) &&
        record.payload['sequences'].includes(fired.sequence),
    );

    await second.sendStopSignal();
    await second.waitForExit();

    const third = ctx.nixie.harness.start();

    await third.ready;

    await ctx.nixie.harness.advance(1, { settle: true });
    await third.kill();

    const records = await ctx.nixie.readRecords();
    const oracle = await runOracle(ctx.nixie);

    expect(isMarkerPresentAfterKill).toBe(isMarkerLeft);
    expect(isMarkerPresentAfterStart).toBeFalse();

    expect(
      waitingRecords.filter(
        (record) =>
          record.sequence > started.sequence &&
          (record.kind === 'task.step_started' || record.kind === 'test.inbox_read'),
      ),
    ).toStrictEqual([]);

    expect(step.sequence).toBeGreaterThan(resumed.sequence);

    expect(
      records
        .filter((record) => record.kind.startsWith('recovery.') || record.kind.startsWith('nixie.'))
        .map((record) => record.kind),
    ).toStrictEqual(['recovery.started', 'nixie.paused', 'nixie.resumed']);

    expect(oracle).toStrictEqual({
      repeatedStepKeys: [],
      repeatedActions: [],
      strayCalls: [],
      heldLeases: [],
      unreadyTasks: [],
      changedEndStates: [],
      projectionDrift: [],
    });
  },
);
