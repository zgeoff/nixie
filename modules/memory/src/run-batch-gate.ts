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

// A batch write's gate outcome, with the text a proposal for it holds: the staged text, or the
// item's text for a retirement.
export interface BatchGateResult {
  readonly gate: ContentGateResult;
  readonly text: string;
}

// Runs a batch's staged write through the content gate, with the message it cites as its only
// evidence. A missing or moved-on item, or a retired item's retirement, is refused before any check
// runs, and an edit of a self-note returns null: the note-taker never edits a self-note.
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

  const early = findEarlyReview(write.text);

  if (early !== null) {
    return { gate: early, text: write.text };
  }

  // an edit of a pinned item changes the core that rides every turn, so it waits for review as a
  // pinning write does, and never fails its batch on the core's budget
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
    },
    { quote: write.quote, found },
  );

  return { gate, text: write.text };
}

// an edit of an item that moved on since the session read it could only become a proposal no one
// can approve, so it fails as stale and the batch runs again
function requireEditTarget(parts: StoreParts, target: VersionRef): Promise<MemoryItemRow> {
  return requireItem(parts.context.log.writer.db.$extendTables<MemoryTables>(), {
    target,
    operation: 'edit',
    states: ['active', 'retired'],
  });
}

// Unicode format characters: zero-width spaces and joiners, bidirectional controls, the byte order
// mark and the soft hyphen
const invisible = /\p{Cf}/u;

// the review a write meets before its quote is read: a hidden character
function findEarlyReview(text: string): ContentGateResult | null {
  if (invisible.test(text)) {
    return buildGateReview('invisible_character', { checks: { tokens: 'fail' } });
  }

  return null;
}
