import { expect, test } from 'bun:test';
import { systemClock } from '@heynixie/clock';
import type { ListedTask } from '@heynixie/tasks';
import { readInbox, readTaskList } from '@heynixie/tasks';
import type { HeldTasks } from './seed-held-tasks';
import { seedHeldTasks } from './seed-held-tasks';
import { startDataLog } from './start-data-log';
import { startInProcessNixie } from './start-in-process-nixie';
import type { BootFiles } from './write-boot-files';

interface HeldRead {
  readonly listed: readonly ListedTask[];
  readonly unreadKinds: readonly (readonly string[])[];
}

function setupTest() {
  return {
    readHeldTasks: async (files: BootFiles, held: HeldTasks): Promise<HeldRead> => {
      const data = await startDataLog({
        dataDir: files.dataDir,
        deploymentKey: files.deploymentKey,
        clock: systemClock,
      });

      const directory = [held.heldID, held.pausedID].map((taskID) => ({
        taskID,
        name: taskID,
        brief: 'A held task.',
        isWokenByMessages: true,
      }));

      const listed = await readTaskList(data.context, { directory }, { callerID: null, limit: 10 });

      const inboxes = await Promise.all(
        [held.heldID, held.pausedID].map((taskID) => readInbox(data.context, taskID)),
      );

      await data.writer.stop();

      return { listed, unreadKinds: inboxes.map((inbox) => inbox.map((record) => record.kind)) };
    },
  };
}

test('it leaves one held started task waiting with a message unread, and one held and paused', async () => {
  const ctx = setupTest();
  const seeded = Promise.withResolvers<HeldTasks>();
  const read = Promise.withResolvers<HeldRead>();

  await startInProcessNixie({
    seedData: async (files) => {
      const held = await seedHeldTasks(files);
      const tasks = await ctx.readHeldTasks(files, held);

      seeded.resolve(held);
      read.resolve(tasks);
    },
  });

  const held = await seeded.promise;
  const tasks = await read.promise;

  expect(tasks.listed.map((task) => [task.id, task.state])).toIncludeSameMembers([
    [held.heldID, 'waiting'],
    [held.pausedID, 'paused'],
  ]);

  expect(tasks.unreadKinds).toStrictEqual([['owner_message'], ['owner_message']]);
});
