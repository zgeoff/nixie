import { readSourceEvidence } from '../evidence/read-source-evidence';
import { buildAskReview } from '../gate/build-ask-review';
import { buildGateReview } from '../gate/build-gate-review';
import type { ContentGateResult } from '../gate/gate-context';
import { pickCoveringRule } from '../gate/pick-covering-rule';
import { runQuotedGate } from '../gate/run-quoted-gate';
import { pickSensitiveReview } from '../sensitive/pick-sensitive-review';
import type { MemoryItemRow, MemoryTables, StoreParts, VersionRef } from '../types';
import { getRowSubject } from '../utils/get-row-subject';
import { requireItem } from '../utils/item/require-item';
import { memoryWriterTaskID } from '../utils/memory-writer-task-id';
import type { SourceMessage, StagedWrite } from '../writer/writer-model';
import { runBatchRetirementGate } from './run-batch-retirement-gate';
import { runBatchRuleGate } from './run-batch-rule-gate';

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
  const verdict = write.verdict;

  if (verdict?.kind === 'rule-ask') {
    return { gate: buildAskReview(verdict.rule), text: write.text, until };
  }

  const early = findEarlyReview(write.text);

  if (early !== null) {
    return { gate: early, text: write.text, until };
  }

  const isPinned = item?.is_pinned === 1;
  const covering = pickCoveringRule(verdict, 'none');

  if (covering !== null) {
    const gate = runBatchRuleGate({ text: write.text, isPinned }, source, covering);

    return { gate: pickSensitiveReview(write, gate), text: write.text, until };
  }

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

  return { gate: pickSensitiveReview(write, gate), text: write.text, until };
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
