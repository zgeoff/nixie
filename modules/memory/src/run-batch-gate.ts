import { buildGateReview } from './build-gate-review';
import type { ContentGateResult } from './gate-types';
import { getRowSubject } from './get-row-subject';
import { memoryWriterTaskID } from './memory-writer-task-id';
import { readSourceEvidence } from './read-source-evidence';
import { requireItem } from './require-item';
import { runBatchRetirementGate } from './run-batch-retirement-gate';
import { runQuotedGate } from './run-quoted-gate';
import type { MemoryItemRow, MemoryTables, StoreParts, VersionRef } from './types';
import type { SourceMessage, StagedWrite } from './writer-types';

export interface BatchGateResult {
  readonly gate: ContentGateResult;
  readonly text: string;

  readonly until?: number | null;
}

export async function runBatchGate(
  parts: StoreParts,
  write: StagedWrite,
  source: SourceMessage,
): Promise<BatchGateResult | null> {
  if (write.op === 'retire') {
    return runBatchRetirementGate(parts, write, source);
  }

  const item = write.target === null ? null : await requireEditTarget(parts, write.target);

  if (item !== null && getRowSubject(item) === 'self') {
    return null;
  }

  const until = write.until === undefined ? (item?.until ?? null) : write.until;
  const early = findEarlyReview(write.text);

  if (early !== null) {
    return { gate: early, text: write.text, until };
  }

  const isPinned = item?.is_pinned === 1;

  const found = await readSourceEvidence(parts.context.log, source, write.quote);

  const gate = await runQuotedGate(
    parts.context,
    {
      text: write.text,
      quote: write.quote,
      eventID: source.sequence,
      isPinned,
      thread: memoryWriterTaskID,
      until: write.until ?? null,
    },
    { quote: write.quote, found },
  );

  if (gate.status === 'pass' && write.target === null && write.isSensitive === true) {
    return {
      gate: buildGateReview('sensitive', {
        checks: gate.checks,
        ...(gate.evidence === null ? {} : { evidence: gate.evidence }),
      }),
      text: write.text,
      until,
    };
  }

  return { gate, text: write.text, until };
}

function requireEditTarget(parts: StoreParts, target: VersionRef): Promise<MemoryItemRow> {
  return requireItem(parts.context.log.writer.db.$extendTables<MemoryTables>(), {
    target,
    operation: 'edit',
    states: ['active', 'retired'],
  });
}

const invisible = /\p{Cf}/u;

function findEarlyReview(text: string): ContentGateResult | null {
  if (invisible.test(text)) {
    return buildGateReview('invisible_character', { checks: { tokens: 'fail' } });
  }

  return null;
}
