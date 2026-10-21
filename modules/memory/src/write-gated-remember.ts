import type { WriteGroup } from './build-write-group';
import { buildWriteGroup } from './build-write-group';
import { ForgottenEvidenceError } from './forgotten-evidence-error';
import type { ContentGateResult, GatedRememberRequest, WriteOutcome } from './gate-types';
import { readNewestMessage } from './read-newest-message';
import { requireLiveEvidence } from './require-live-evidence';
import { runSubjectGate } from './run-subject-gate';
import type { MemorySubject, StoreParts } from './types';
import { writeMemoryProposal } from './write-memory-proposal';
import { writeRememberedItem } from './write-remembered-item';

export async function writeGatedRemember(
  parts: StoreParts,
  request: GatedRememberRequest,
): Promise<WriteOutcome> {
  const checked = await runSubjectGate(parts, request);

  const gate = checked.gate;

  const newest = await readNewestMessage(parts.context.log, request.caller.thread);

  const group = buildWriteGroup(request.caller, newest);

  if (gate.status === 'pass') {
    return applyPassedRemember(parts, request, { gate, group, subject: checked.subject });
  }

  return writeRememberProposal(parts, request, { review: gate, group, subject: checked.subject });
}

interface PassedRemember {
  readonly gate: Extract<ContentGateResult, { readonly status: 'pass' }>;
  readonly group: WriteGroup;
  readonly subject: MemorySubject;
}

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

    return writeRememberProposal(parts, request, {
      review,
      group: passed.group,
      subject: passed.subject,
    });
  }
}

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
      ...(request.target === undefined ? { subject: passed.subject } : { target: request.target }),
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

interface ReviewedRemember {
  readonly review: Extract<ContentGateResult, { readonly status: 'review' }>;
  readonly group: WriteGroup;
  readonly subject: MemorySubject;
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

    quote: request.image === undefined ? (request.quote ?? null) : null,
    reason: review.reason,
    evidence: review.evidence,
    checks: review.checks,
    checkerReason: review.checkerReason,
    caller: request.caller,
    group: reviewed.group,
    subject: reviewed.subject,
  });

  return { status: 'proposed', ...written, reason: review.reason };
}
