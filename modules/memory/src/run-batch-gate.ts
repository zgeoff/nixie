import { buildGateReview } from './build-gate-review';
import { findMissingToken } from './find-missing-token';
import { findSourceEvidence } from './find-source-evidence';
import type { ContentGateResult } from './gate-types';
import { memoryWriterTaskID } from './memory-writer-task-id';
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

// Runs a batch's staged write through the content gate outside any transaction, with the message
// it cites as its only evidence. A write whose item is missing or moved on is refused before any
// check runs, and so is a retirement of a retired item.
export async function runBatchGate(
  parts: StoreParts,
  write: StagedWrite,
  source: SourceMessage,
): Promise<BatchGateResult> {
  if (write.op === 'retire') {
    return runBatchRetirementGate(parts, write, source);
  }

  const item = write.target === null ? null : await requireEditTarget(parts, write.target);
  const early = findEarlyReview(item, write.text, source);

  if (early !== null) {
    return { gate: early, text: write.text };
  }

  // an edit of a pinned item changes the core that rides every turn, so it waits for review as a
  // pinning write does, and never fails its batch on the core's budget
  const isPinned = item?.is_pinned === 1;

  const found = await findSourceEvidence(parts.context.log, source, write.quote);

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

// The review a write meets before its quote is read: a hidden character, or an edit of a
// self-note, which waits for your review whoever edits it. The self-note's token check runs
// against the cited message, so the review shows a destination you never typed.
function findEarlyReview(
  item: MemoryItemRow | null,
  text: string,
  source: SourceMessage,
): ContentGateResult | null {
  if (invisible.test(text)) {
    return buildGateReview('invisible_character', { checks: { tokens: 'fail' } });
  }

  if (item?.kind === 'self') {
    const tokens = findMissingToken(text, source.text) === null ? 'pass' : 'fail';

    return buildGateReview('self_note', { checks: { tokens } });
  }

  return null;
}

// Unicode format characters: zero-width spaces and joiners, bidirectional controls, the byte order
// mark and the soft hyphen
const invisible = /\p{Cf}/u;

// an edit of an item that moved on since the session read it could only become a proposal no one
// can approve, so it fails as stale and the batch runs again
function requireEditTarget(parts: StoreParts, target: VersionRef): Promise<MemoryItemRow> {
  return requireItem(parts.context.log.writer.db.$extendTables<MemoryTables>(), {
    target,
    operation: 'edit',
    states: ['active', 'retired'],
  });
}
