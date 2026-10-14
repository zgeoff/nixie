import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { ConsolidationDiff, StagedChange } from '../consolidation-types';
import { memoryConsolidatorTaskID } from '../memory-consolidator-task-id';
import { planDiffRecord } from '../plan-diff-record';
import type { TestMemory } from './start-test-memory';

export interface DiffRequest {
  readonly changes: readonly StagedChange[];

  // the run's time on the clock the store's gate reads, now by default
  readonly now?: number;

  // how long each change waits for an answer, a week by default
  readonly lapseMs?: number;
}

// Writes the record a consolidator run commits for the staged changes, on the consolidator's
// thread, and returns the pending diff it made.
export async function createConsolidationDiff(
  memory: Pick<TestMemory, 'log' | 'store'>,
  request: DiffRequest,
): Promise<ConsolidationDiff> {
  const record = await planDiffRecord(memory.log, {
    changes: request.changes,
    model: 'claude-test-1',
    shownItems: request.changes.flatMap((change) => change.inputs).length,
    now: request.now ?? Date.now(),
    lapseMs: request.lapseMs ?? 7 * 24 * 60 * 60 * 1000,
    definitions: { snapshotHash: 'sha256:test' },
  });

  await writeRecords(memory.log, [{ ...record, thread: memoryConsolidatorTaskID }]);

  const diff = await memory.store.consolidations.readPending();

  invariant(diff, 'the run made no pending diff');
  return diff;
}
