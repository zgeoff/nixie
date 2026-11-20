import type { LogRecord } from '@heynixie/log';
import { readThreadNewestFirst } from '@heynixie/log';
import type { StepInput } from '@heynixie/tasks';
import { buildStepRunID } from '@heynixie/tasks';
import { writeReplyVoids } from '../turn/write-reply-voids';
import type { ConversationRun } from '../types';
import { collectLostReplies } from './collect-lost-replies';

// A runner that died mid-turn left the replies it wrote with no step commit and no void. The step
// that takes the task next voids them before it does anything else, so the model reads none of them.
export async function voidLostReplies(
  run: Pick<ConversationRun, 'context'>,
  input: StepInput,
): Promise<void> {
  const records = await readUncommittedRecords(run, input);

  const lost = collectLostReplies(records, buildStepRunID(input));

  await writeReplyVoids(
    run,
    input,
    lost.map((group) => ({
      sequences: group.sequences,
      runID: group.runID,
      reason: 'attempt_lost' as const,
    })),
  );
}

const lostKinds = ['model.reply', 'model.reply_voided', 'task.step_committed'] as const;

// The read stops at the thread's last step commit, so a long thread costs no more than its tail.
async function readUncommittedRecords(
  run: Pick<ConversationRun, 'context'>,
  input: StepInput,
): Promise<readonly LogRecord[]> {
  const records: LogRecord[] = [];

  for await (const record of readThreadNewestFirst(run.context, input.taskID, lostKinds)) {
    records.push(record);

    if (record.kind === 'task.step_committed') {
      break;
    }
  }

  return records;
}
