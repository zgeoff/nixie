import { buildGateReview } from './build-gate-review';
import { findSourceEvidence } from './find-source-evidence';
import type { ContentGateResult } from './gate-types';
import { memoryWriterTaskID } from './memory-writer-task-id';
import { readItemText } from './read-item-text';
import { requireItem } from './require-item';
import { runQuotedGate } from './run-quoted-gate';
import { runRetirementChecker } from './run-retirement-checker';
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
    const itemText = await readItemText(parts, write.target);

    return {
      gate: await runBatchRetirementGate(parts, { itemText, quote: write.quote, source }),
      text: itemText,
    };
  }
  if (invisible.test(write.text)) {
    return {
      gate: buildGateReview('invisible_character', { checks: { tokens: 'fail' } }),
      text: write.text,
    };
  }

  // an edit of a pinned item changes the core that rides every turn, so it waits for review as a
  // pinning write does, and never fails its batch on the core's budget
  const item = write.target === null ? null : await requireEditTarget(parts, write.target);
  const isPinned = item?.is_pinned === 1;
  const found = await findSourceEvidence(parts.context.log, source, write.quote);
  const gate = await runQuotedGate(
    parts.context,
    { text: write.text, quote: write.quote, isPinned, thread: memoryWriterTaskID },
    { quote: write.quote, found },
  );

  return { gate, text: write.text };
}

// Unicode format characters: zero-width spaces and joiners, bidirectional controls, the byte order
// mark and the soft hyphen
const invisible = /\p{Cf}/u;

interface BatchRetirement {
  readonly itemText: string;
  readonly quote: string;
  readonly source: SourceMessage;
}

// the writer's staging binds a retirement to a version the session was shown, so the read check
// passes by construction
async function runBatchRetirementGate(
  parts: StoreParts,
  retirement: BatchRetirement,
): Promise<ContentGateResult> {
  const found = await findSourceEvidence(parts.context.log, retirement.source, retirement.quote);

  if (found.status === 'review') {
    return buildGateReview(found.reason, { checks: { read: 'pass', quote: 'fail' } });
  }
  return runRetirementChecker(parts.context, retirement.itemText, found);
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
