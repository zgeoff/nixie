import { expect, test } from 'bun:test';
import { systemClock } from '@heynixie/clock';
import type { TasksTables } from '@heynixie/tasks';
import { seedHeldTasks } from './seed-held-tasks';
import { startDataLog } from './start-data-log';
import { startInProcessNixie } from './start-in-process-nixie';

async function setupTest() {
  const nixie = await startInProcessNixie();

  nixie.signalStop();

  await nixie.exited;

  return {
    nixie,
    readStates: async () => {
      const data = await startDataLog({
        dataDir: nixie.dataDir,
        deploymentKey: nixie.deploymentKey,
        clock: systemClock,
      });

      const rows = await data.writer.db
        .$extendTables<TasksTables>()
        .selectFrom('tasks')
        .select(['task_id', 'state', 'read_cursor', 'last_inbox_sequence'])
        .where('started_by', 'is not', null)
        .execute();

      await data.writer.stop();

      return rows;
    },
  };
}

test('it leaves one held started task waiting with a message unread, and one held and paused', async () => {
  const ctx = await setupTest();
  const held = await seedHeldTasks(ctx.nixie);
  const rows = await ctx.readStates();

  expect(rows.map((row) => [row.task_id, row.state])).toIncludeSameMembers([
    [held.heldID, 'waiting'],
    [held.pausedID, 'paused'],
  ]);

  expect(rows).toSatisfyAll(
    (row: (typeof rows)[number]) => row.read_cursor < row.last_inbox_sequence,
  );
});
