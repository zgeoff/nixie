import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import { handoverAskedFieldsSchema } from './handover-asked-codec';

export interface OpenHandover {
  readonly sequence: number;
  readonly askedAtMs: number;

  // null when the reason was forgotten
  readonly reason: string | null;
}

const answeringKinds = [
  'computer.handover_asked',
  'computer.handover_closed',
  'computer.takeover_started',
] as const;

// The ask that nothing has answered: the newest of an ask, its close and a take-over's start is the
// ask itself.
export async function readOpenHandover(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
): Promise<OpenHandover | null> {
  const [newest] = await readRecords(log, {
    afterSequence: 0,
    thread: conversationTaskID,
    kinds: answeringKinds,
    order: 'newest',
    limit: 1,
  });

  if (newest === undefined || newest.record.kind !== 'computer.handover_asked') {
    return null;
  }

  const fields =
    newest.record.erasable.status === 'readable'
      ? handoverAskedFieldsSchema.safeParse(newest.record.erasable.fields)
      : null;

  return {
    sequence: newest.record.sequence,
    askedAtMs: newest.record.recordedAt.getTime(),
    reason: fields?.success === true ? fields.data.reason : null,
  };
}
