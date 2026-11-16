import { requireLiveEvidence } from '../evidence/require-live-evidence';
import { requireUnforgottenQuote } from '../evidence/require-unforgotten-quote';
import type { ContentGateResult, GatedRememberRequest, WriteOutcome } from '../gate/gate-context';
import { writeRememberedItem } from '../item/write-remembered-item';
import { writeMemoryProposal } from '../memory/write-memory-proposal';
import { readNewestMessage } from '../message/read-newest-message';
import { runSubjectGate } from '../subject/run-subject-gate';
import type { MemorySubject, StoreParts } from '../types';
import { requireCheckerSnapshot } from '../utils/checker/require-checker-snapshot';
import { ForgottenEvidenceError } from '../utils/error/forgotten-evidence-error';
import { UntilPassedError } from '../utils/error/until-passed-error';
import type { WriteGroup } from '../write/build-write-group';
import { buildWriteGroup } from '../write/build-write-group';

export async function writeGatedRemember(
  parts: StoreParts,
  request: GatedRememberRequest,
): Promise<WriteOutcome> {
  const now = parts.context.gate.clock.now();

  if (request.until !== undefined && request.until !== null && request.until <= now) {
    throw new UntilPassedError(request.until, now);
  }

  const checked = await runSubjectGate(parts, request);

  const gate = checked.gate;

  const newest = await readNewestMessage(parts.context.log, request.caller.thread);

  const group = buildWriteGroup(request.caller, newest);
  const subject = checked.subject;

  if (gate.status === 'pass') {
    return applyPassedRemember(parts, request, {
      gate,
      group,
      subject,
      until: checked.until,
      textVersion: checked.textVersion,
    });
  }

  return writeRememberProposal(parts, request, {
    review: gate,
    group,
    subject,
    newSubject: checked.newSubject,
    until: checked.until,
    textVersion: checked.textVersion,
  });
}

interface PassedRemember {
  readonly textVersion: number | null;
  readonly gate: Extract<ContentGateResult, { readonly status: 'pass' }>;
  readonly group: WriteGroup;
  readonly subject: MemorySubject;
  readonly until: number | null;
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
      newSubject: null,
      until: passed.until,
      textVersion: passed.textVersion,
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
      ...(request.labels === undefined ? {} : { labels: request.labels }),
      ...(evidence === null || request.quote === undefined
        ? {}
        : { evidence, evidenceQuote: request.quote }),
      ...(request.until === undefined ? {} : { until: request.until }),
    },
    {
      noticeKey: passed.group.noticeKey,
      requireInTransaction: async (db) => {
        requireCheckerSnapshot(parts.context, passed.gate.checks);

        if (evidence !== null) {
          await requireUnforgottenQuote(db, evidence.recordSequence);
          await requireLiveEvidence(db, evidence.recordSequence);
        }
      },
    },
  );

  return { status: 'applied', itemID: ref.itemID, version: ref.version };
}

interface ReviewedRemember {
  readonly review: Extract<ContentGateResult, { readonly status: 'review' }>;
  readonly group: WriteGroup;
  readonly subject: MemorySubject;
  readonly newSubject: MemorySubject | null;
  readonly until: number | null;
  readonly textVersion: number | null;
}

async function writeRememberProposal(
  parts: StoreParts,
  request: GatedRememberRequest,
  reviewed: ReviewedRemember,
): Promise<WriteOutcome> {
  const review = reviewed.review;

  const written = await writeMemoryProposal(parts, {
    operation: 'remember',
    target:
      reviewed.textVersion === null || request.target === undefined
        ? null
        : { itemID: request.target.itemID, version: reviewed.textVersion },
    isPinned: false,
    text: request.text,

    quote: request.image === undefined ? (request.quote ?? null) : null,
    reason: review.reason,
    evidence: review.evidence,
    ...(request.eventID === undefined ? {} : { quotedEventID: request.eventID }),
    checks: review.checks,
    checkerReason: review.checkerReason,
    caller: request.caller,
    group: reviewed.group,
    subject: reviewed.subject,
    ...(reviewed.newSubject === null ? {} : { newSubject: reviewed.newSubject }),
    until: reviewed.until,
    ...(request.labels === undefined
      ? {}
      : {
          labels: request.labels,
          ...(request.target === undefined ? {} : { targetRevision: request.target.version }),
        }),
  });

  return { status: 'proposed', ...written, reason: review.reason };
}
