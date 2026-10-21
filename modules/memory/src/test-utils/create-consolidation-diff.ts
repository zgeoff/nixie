import type { RecordInput } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { ConsolidationDiff, StagedChange } from '../consolidation-types';
import { memoryConsolidatorTaskID } from '../memory-consolidator-task-id';
import type { PlannedSummary } from '../plan-diff-record';
import { planDiffRecord } from '../plan-diff-record';
import type { TestMemory } from './start-test-memory';

export interface DiffRequest {
  readonly changes: readonly StagedChange[];

  readonly now?: number;

  readonly lapseMs?: number;

  readonly summary?: PlannedSummary;
}

export async function createConsolidationDiff(
  memory: Pick<TestMemory, 'log' | 'store'>,
  request: DiffRequest,
): Promise<ConsolidationDiff> {
  const records = await planDiffRecord(memory.log, {
    changes: request.changes,
    model: 'claude-test-1',
    shownItems: request.changes.flatMap((change) => change.inputs).length,
    summary: request.summary ?? null,
    now: request.now ?? Date.now(),
    lapseMs: request.lapseMs ?? 7 * 24 * 60 * 60 * 1000,
    definitions: { snapshotHash: 'sha256:test' },
  });

  const threaded: RecordInput[] = [];

  for (const record of records) {
    threaded.push({ ...record, thread: memoryConsolidatorTaskID });
  }

  await writeRecords(memory.log, threaded);

  const diff = await memory.store.consolidations.readPending();

  invariant(diff, 'the run made no pending diff');

  return diff;
}
