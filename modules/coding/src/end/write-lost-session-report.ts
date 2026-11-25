import { readRecords, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { readStepMessaging, writeTaskMessageInTransaction } from '@heynixie/tasks';
import { codingSessionLostCodec } from '../record/coding-session-lost-codec';
import { readCodingTask } from '../step/read-coding-task';
import type { CodingAdapter, CodingContext } from '../types';

export interface LostSpawn {
  readonly taskID: string;
  readonly actionID: string;
}

// Records once, on an ended coding task's thread, that its spawn started a session nixie cannot
// find, and tells the task's report target when it still takes messages. The session may still
// run, and nothing in nixie tracks or stops it.
export async function writeLostSessionReport(
  context: CodingContext,
  adapter: CodingAdapter,
  spawn: LostSpawn,
): Promise<void> {
  const tasks = context.tasks;

  const task = await readCodingTask(tasks.log, adapter.id, spawn.taskID);

  if (task === null) {
    return;
  }

  const recorded = await readRecords(tasks.log, {
    afterSequence: 0,
    thread: spawn.taskID,
    kinds: [codingSessionLostCodec.kind],
    limit: 1,
  });

  if (recorded.length > 0) {
    return;
  }

  const messaging = await readStepMessaging(tasks);

  const sent = await withWriteTransaction(tasks.log.writer, async (tx) => {
    await writeRecordsInTransaction(tx, tasks.log, [
      {
        kind: codingSessionLostCodec.kind,
        definitions: tasks.definitions(),
        thread: spawn.taskID,
        payload: codingSessionLostCodec.encode({
          taskID: spawn.taskID,
          adapter: adapter.id,
          actionID: spawn.actionID,
        }),
      },
    ]);

    return writeTaskMessageInTransaction(
      tx,
      tasks,
      {
        from: spawn.taskID,
        to: task.reportTarget,
        kind: 'progress',
        body:
          'The coding session this task started may still be running, but nixie cannot find its ID, ' +
          `so it could not stop it. Find it in ${adapter.id}'s own list of sessions, or join it by ` +
          'its ID from coding.sessions.',
        replyTo: null,
        onBehalfOf: [],
        wake: true,
      },
      { messaging, senderHop: 0, stepKey: `lost:${spawn.taskID}` },
    );
  });

  if (sent.status === 'refused') {
    context.logEvent('coding.lost_session_unreported', {
      taskID: spawn.taskID,
      reason: sent.refusal.reason,
    });
  }
}
