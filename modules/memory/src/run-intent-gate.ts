import type { LogTables } from '@heynixie/log';
import { sql } from 'kysely';
import { buildGateReview } from './build-gate-review';
import type { QuoteEvidenceResult } from './find-quote-evidence';
import { findQuoteEvidence } from './find-quote-evidence';
import type { ContentGateResult } from './gate-types';
import { pickCheckerReviewReason } from './pick-checker-review-reason';
import { renderCheckerInput } from './render-checker-input';
import { retirementCheckerPrompt } from './retirement-checker-prompt';
import type { MemoryContext, VersionRef } from './types';

export interface IntentGateRequest {
  readonly target: VersionRef;
  readonly intentQuote: string | null;
  readonly thread: string;

  // the text of the item at the target version, which the checker reads as untrusted data
  readonly itemText: string;
}

// Runs the retirement intent gate outside any transaction: the thread must have read the item at
// that version, the intent quote must be typed, and the checker must confirm the request. A
// retirement adds no text, so the token check never runs.
export async function runIntentGate(
  context: Pick<MemoryContext, 'log' | 'gate'>,
  request: IntentGateRequest,
): Promise<ContentGateResult> {
  if (!(await hasReadVersion(context, request))) {
    return buildGateReview('ambiguous_target', { checks: { read: 'fail' } });
  }
  if (request.intentQuote === null) {
    return buildGateReview('no_quote', { checks: { read: 'pass', quote: 'fail' } });
  }
  const found = await findQuoteEvidence(context.log, {
    thread: request.thread,
    quote: request.intentQuote,
    window: context.gate.limits.evidenceWindow,
  });

  if (found.status === 'review') {
    return buildGateReview(found.reason, { checks: { read: 'pass', quote: 'fail' } });
  }
  return runRetirementChecker(context, request, found);
}

type FoundEvidence = Extract<QuoteEvidenceResult, { readonly status: 'found' }>;

async function runRetirementChecker(
  context: Pick<MemoryContext, 'gate'>,
  request: IntentGateRequest,
  found: FoundEvidence,
): Promise<ContentGateResult> {
  const answer = await context.gate.check({
    prompt: retirementCheckerPrompt,
    input: renderCheckerInput(found.message, found.evidence, {
      kind: 'item_to_retire',
      text: request.itemText,
    }),
  });
  const checks = {
    read: 'pass',
    quote: 'pass',
    checker: { verdict: answer.verdict, model: answer.model, failure: answer.failure },
  };

  if (answer.verdict === 'asserted') {
    return { status: 'pass', source: 'owner', evidence: found.evidence, checks };
  }
  return buildGateReview(pickCheckerReviewReason(answer), {
    evidence: found.evidence,
    checks,
    checkerReason: answer.reason,
  });
}

// A recall record lists each item and version it delivered to the thread, so the thread read the
// target when one of them names it.
async function hasReadVersion(
  context: Pick<MemoryContext, 'log'>,
  request: IntentGateRequest,
): Promise<boolean> {
  const row = await context.log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('sequence')
    .where('kind', '=', 'memory.recalled')
    .where('thread', '=', request.thread)
    .where(
      sql<boolean>`exists (select 1 from json_each(records.payload, '$.items') as item
        where json_extract(item.value, '$.itemID') = ${request.target.itemID}
        and json_extract(item.value, '$.version') = ${request.target.version})`,
    )
    .limit(1)
    .executeTakeFirst();

  return row !== undefined;
}
