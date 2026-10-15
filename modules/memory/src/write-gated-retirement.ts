import type { WriteGroup } from './build-write-group';
import { buildWriteGroup } from './build-write-group';
import { findNewestMessage } from './find-newest-message';
import { ForgottenEvidenceError } from './forgotten-evidence-error';
import type { ContentGateResult, GatedRetireRequest, WriteOutcome } from './gate-types';
import { readItemText } from './read-item-text';
import { requireLiveEvidence } from './require-live-evidence';
import { runIntentGate } from './run-intent-gate';
import type { StoreParts } from './types';
import { writeMemoryProposal } from './write-memory-proposal';
import { writeRetirement } from './write-retirement';

// Runs a memory.retire through the intent gate. A retirement that passes applies at once and keeps
// the source of the text it copies; every other one becomes a proposal. A missing item, a stale
// version or a retired item is refused before any check runs.
export async function writeGatedRetirement(
  parts: StoreParts,
  request: GatedRetireRequest,
): Promise<WriteOutcome> {
  const itemText = await readItemText(parts, request.target);

  const gate = await runIntentGate(parts.context, {
    target: request.target,
    intentQuote: request.intentQuote ?? null,
    thread: request.caller.thread,
    itemText,
  });

  const newest = await findNewestMessage(parts.context.log, request.caller.thread);

  const group = buildWriteGroup(request.caller, newest);

  if (gate.status === 'pass') {
    return applyPassedRetirement(parts, request, { gate, group, itemText });
  }

  return writeRetirementProposal(parts, request, { review: gate, group, itemText });
}

interface ReviewedRetirement {
  readonly review: Extract<ContentGateResult, { readonly status: 'review' }>;
  readonly group: WriteGroup;
  readonly itemText: string;
}

async function writeRetirementProposal(
  parts: StoreParts,
  request: GatedRetireRequest,
  reviewed: ReviewedRetirement,
): Promise<WriteOutcome> {
  const review = reviewed.review;

  const written = await writeMemoryProposal(parts, {
    operation: 'retire',
    target: request.target,
    isPinned: false,
    text: reviewed.itemText,
    quote: request.intentQuote ?? null,
    reason: review.reason,
    evidence: review.evidence,
    checks: review.checks,
    checkerReason: review.checkerReason,
    caller: request.caller,
    group: reviewed.group,
  });

  return { status: 'proposed', ...written, reason: review.reason };
}

// a forget that completed while the checker answered turns a passing retirement into a proposal
async function applyPassedRetirement(
  parts: StoreParts,
  request: GatedRetireRequest,
  passed: PassedRetirement,
): Promise<WriteOutcome> {
  try {
    return await applyRetirement(parts, request, passed);
  } catch (error) {
    if (!(error instanceof ForgottenEvidenceError)) {
      throw error;
    }

    const review = {
      status: 'review' as const,
      reason: 'forgotten_evidence' as const,
      evidence: passed.gate.evidence,
      checks: passed.gate.checks,
      checkerReason: null,
    };

    return writeRetirementProposal(parts, request, { ...passed, review });
  }
}

interface PassedRetirement {
  readonly gate: Extract<ContentGateResult, { readonly status: 'pass' }>;
  readonly group: WriteGroup;
  readonly itemText: string;
}

async function applyRetirement(
  parts: StoreParts,
  request: GatedRetireRequest,
  passed: PassedRetirement,
): Promise<WriteOutcome> {
  const caller = request.caller;
  const evidence = passed.gate.evidence;

  const ref = await writeRetirement(
    parts,
    {
      target: request.target,
      provenance: {
        origin: caller.origin,
        source: passed.gate.source,
        taskID: caller.taskID,
        proposalID: null,
        checks: passed.gate.checks,
        thread: caller.thread,
        model: caller.model,
      },
      ...(request.intentQuote === undefined ? {} : { intentQuote: request.intentQuote }),
      ...(evidence === null ? {} : { intentEvidence: evidence }),
    },
    {
      noticeKey: passed.group.noticeKey,
      ...(evidence === null
        ? {}
        : { requireInTransaction: (db) => requireLiveEvidence(db, evidence.recordSequence) }),
    },
  );

  return { status: 'applied', itemID: ref.itemID, version: ref.version };
}
