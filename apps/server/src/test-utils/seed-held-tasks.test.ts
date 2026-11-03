import { expect, test } from 'bun:test';
import { systemClock } from '@heynixie/clock';
import type { TasksTables } from '@heynixie/tasks';
import type { HeldTasks } from './seed-held-tasks';
import { seedHeldTasks } from './seed-held-tasks';
import { startDataLog } from './start-data-log';
import { startInProcessNixie } from './start-in-process-nixie';
import type { BootFiles } from './write-boot-files';

function setupTest() {
  return {
    readStartedRows: async (files: BootFiles) => {
      const data = await startDataLog({
        dataDir: files.dataDir,
        deploymentKey: files.deploymentKey,
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
  const ctx = setupTest();
  const seeded = Promise.withResolvers<HeldTasks>();
  const read = Promise.withResolvers<Awaited<ReturnType<typeof ctx.readStartedRows>>>();

  await startInProcessNixie({
    seedData: async (files) => {
      const held = await seedHeldTasks(files);
      const rows = await ctx.readStartedRows(files);

      seeded.resolve(held);
      read.resolve(rows);
    },
  });

  const held = await seeded.promise;
  const rows = await read.promise;

  expect(rows.map((row) => [row.task_id, row.state])).toIncludeSameMembers([
    [held.heldID, 'waiting'],
    [held.pausedID, 'paused'],
  ]);

  expect(rows).toSatisfyAll(
    (row: (typeof rows)[number]) => row.read_cursor < row.last_inbox_sequence,
  );
});
