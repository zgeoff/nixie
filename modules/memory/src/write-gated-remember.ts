import type { WriteGroup } from './build-write-group';
import { buildWriteGroup } from './build-write-group';
import { findNewestMessage } from './find-newest-message';
import { ForgottenEvidenceError } from './forgotten-evidence-error';
import type { ContentGateResult, GatedRememberRequest, WriteOutcome } from './gate-types';
import { requireLiveEvidence } from './require-live-evidence';
import { runKindGate } from './run-kind-gate';
import type { MemoryKind, StoreParts } from './types';
import { writeMemoryProposal } from './write-memory-proposal';
import { writeRememberedItem } from './write-remembered-item';

// Runs a memory.remember, or a memory.edit when the write names its target, through the gate of its
// item's kind. A passing write applies at once and any other becomes a proposal; a self-note never
// passes. An edit of a missing item or a moved-on version is refused before any check runs.
export async function writeGatedRemember(
  parts: StoreParts,
  request: GatedRememberRequest,
): Promise<WriteOutcome> {
  const checked = await runKindGate(parts, request);

  const gate = checked.gate;

  const newest = await findNewestMessage(parts.context.log, request.caller.thread);

  const group = buildWriteGroup(request.caller, newest);

  if (gate.status === 'pass') {
    return applyPassedRemember(parts, request, { gate, group });
  }

  return writeRememberProposal(parts, request, { review: gate, group, itemKind: checked.itemKind });
}

interface ReviewedRemember {
  readonly review: Extract<ContentGateResult, { readonly status: 'review' }>;
  readonly group: WriteGroup;
  readonly itemKind: MemoryKind;
}

async function writeRememberProposal(
  parts: StoreParts,
  request: GatedRememberRequest,
  reviewed: ReviewedRemember,
): Promise<WriteOutcome> {
  const review = reviewed.review;

  const written = await writeMemoryProposal(parts, {
    operation: 'remember',
    target: request.target ?? null,
    isPinned: request.isPinned === true,
    text: request.text,
    quote: request.quote ?? null,
    reason: review.reason,
    evidence: review.evidence,
    checks: review.checks,
    checkerReason: review.checkerReason,
    caller: request.caller,
    group: reviewed.group,
    itemKind: reviewed.itemKind,
  });

  return { status: 'proposed', ...written, reason: review.reason };
}

// a forget that completed while the checker answered turns a passing write into a proposal
async function applyPassedRemember(
  parts: StoreParts,
  request: GatedRememberRequest,
  passed: PassedRemember,
): Promise<WriteOutcome> {
  try {
    return await applyRemember(parts, request, passed);
  } catch (error) {
    if (!(error instanceof ForgottenEvidenceError)) {
      throw error;
    }

    const gate = passed.gate;

    const review = {
      status: 'review' as const,
      reason: 'forgotten_evidence' as const,
      evidence: gate.evidence,
      checks: gate.checks,
      checkerReason: null,
    };

    // only a fact passes the gate, so only a fact turns into a proposal here
    return writeRememberProposal(parts, request, {
      review,
      group: passed.group,
      itemKind: 'fact',
    });
  }
}

interface PassedRemember {
  readonly gate: Extract<ContentGateResult, { readonly status: 'pass' }>;
  readonly group: WriteGroup;
}

// the version takes the source and checks the gate gave it, and the model of the call that wrote it
async function applyRemember(
  parts: StoreParts,
  request: GatedRememberRequest,
  passed: PassedRemember,
): Promise<WriteOutcome> {
  const caller = request.caller;
  const evidence = passed.gate.evidence;

  const ref = await writeRememberedItem(
    parts,
    {
      text: request.text,
      provenance: {
        origin: caller.origin,
        source: passed.gate.source,
        taskID: caller.taskID,
        proposalID: null,
        checks: passed.gate.checks,
        thread: caller.thread,
        model: caller.model,
      },
      ...(request.target === undefined ? {} : { target: request.target }),
      ...(evidence === null || request.quote === undefined
        ? {}
        : { evidence, evidenceQuote: request.quote }),
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
