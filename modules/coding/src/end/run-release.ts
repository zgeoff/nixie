import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { RunnerEndCause, RunnerEndCommit } from '@heynixie/tasks';
import { readBinding } from '../session/read-binding';
import type { CodingAdapter, CodingContext } from '../types';
import { pickRelease } from './pick-release';

export interface ReleaseRequest {
  readonly taskID: string;
  readonly cause: RunnerEndCause;
  readonly commit: (input: RunnerEndCommit) => Promise<void>;
}

// Lets go of the session of a coding task that ended, for the runner's `ended` and for the sweep.
// A stop of a started session that fails leaves the binding, so the sweep tries again.
export async function runRelease(
  context: CodingContext,
  adapter: CodingAdapter,
  request: ReleaseRequest,
): Promise<void> {
  const log = context.tasks.log;

  const binding = await readBinding(log.writer.db, request.taskID);

  const release = pickRelease({
    binding,
    cause: request.cause,
    definitions: context.tasks.definitions(),
    causeSequence: await readNewestSequence(log, request.taskID),
  });

  if (release.kind === 'none' || binding === null) {
    return;
  }

  if (release.kind === 'commit') {
    await request.commit({ records: release.records, actions: release.actions });

    return;
  }

  const reply = await adapter.stop({ id: binding.sessionID });

  if (reply.status !== 'ok' && reply.reason !== 'no_such_session') {
    context.logEvent('coding.stop_failed', { taskID: request.taskID, reason: reply.reason });

    return;
  }

  await request.commit({ records: release.records, actions: [] });
}

// The newest record of the task's thread: the stop, close or failure that ended it.
async function readNewestSequence(log: Log, taskID: string): Promise<number> {
  const [newest] = await readRecords(log, {
    afterSequence: 0,
    thread: taskID,
    order: 'newest',
    limit: 1,
  });

  return newest?.record.sequence ?? 0;
}
