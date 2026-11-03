import { systemClock } from '@heynixie/clock';
import type { TasksContext } from '@heynixie/tasks';
import { claimTask, writeInboxRecords, writeStepCommit, writeTaskControl } from '@heynixie/tasks';
import { seedConversationStep, seedStartedTask } from '@heynixie/tasks/test-utils';
import invariant from 'tiny-invariant';
import { startDataLog } from './start-data-log';
import type { BootFiles } from './write-boot-files';

export interface HeldTasks {
  readonly heldID: string;
  readonly pausedID: string;
}

// A held task waits with a message unread, as the step that held it left it; one of the two is
// also paused. No nixie may hold the data's writer lock.
export async function seedHeldTasks(
  nixie: Pick<BootFiles, 'dataDir' | 'deploymentKey'>,
): Promise<HeldTasks> {
  const testLog = await startDataLog({
    dataDir: nixie.dataDir,
    deploymentKey: nixie.deploymentKey,
    clock: systemClock,
  });

  try {
    const context = testLog.context;

    const starter = await seedConversationStep(context);

    const heldID = await seedStartedTask(context, {
      starter: starter.claim,
      name: 'Tide tables',
      brief: 'Find the high tides for Saturday.',
    });

    const pausedID = await seedStartedTask(context, {
      starter: starter.claim,
      name: 'Moon phases',
      brief: 'List the full moons this month.',
    });

    await writeStepCommit(context, starter.claim, {
      next: 'wait',
      records: [],
      acknowledged: [starter.messageSequence],
    });

    await holdTask(context, heldID);
    await holdTask(context, pausedID);
    await writeTaskControl(context, { taskID: pausedID, control: 'pause' });

    return { heldID, pausedID };
  } finally {
    await testLog.writer.stop();
  }
}

async function holdTask(context: TasksContext, taskID: string): Promise<void> {
  const claim = await claimTask(context, { holder: 'seed-runner', leaseMs: 60_000, taskID });

  invariant(claim, 'the task to hold is ready');

  await writeInboxRecords(context, [
    {
      kind: 'owner_message',
      definitions: context.definitions(),
      thread: taskID,
      erasable: { text: 'Saturday only, please.' },
    },
  ]);

  await writeStepCommit(context, claim, { next: 'hold', records: [], acknowledged: [] });
}
