import { requireLiveEvidence } from '../evidence/require-live-evidence';
import type { ContentGateResult, GatedRetireRequest, WriteOutcome } from '../gate/gate-context';
import { runIntentGate } from '../gate/run-intent-gate';
import { readItemText } from '../item/read-item-text';
import { writeMemoryProposal } from '../memory/write-memory-proposal';
import { readNewestMessage } from '../message/read-newest-message';
import { writeRetirement } from '../retirement/write-retirement';
import type { StoreParts } from '../types';
import { requireCheckerSnapshot } from '../utils/checker/require-checker-snapshot';
import { ForgottenEvidenceError } from '../utils/error/forgotten-evidence-error';
import type { WriteGroup } from '../write/build-write-group';
import { buildWriteGroup } from '../write/build-write-group';

const selfNoteRetirement: ContentGateResult = {
  status: 'pass',
  source: 'untrusted',
  evidence: null,
  checks: { selfNote: 'retired' },
};

export async function writeGatedRetirement(
  parts: StoreParts,
  request: GatedRetireRequest,
): Promise<WriteOutcome> {
  const item = await readItemText(parts, request.target, 'retire');

  const itemText = item.text;

  const gate =
    item.subject === 'self' && request.caller.origin === 'conversation'
      ? selfNoteRetirement
      : await runIntentGate(parts.context, {
          target: request.target,
          intentQuote: request.intentQuote ?? null,
          thread: request.caller.thread,
          itemText,
        });

  const newest = await readNewestMessage(parts.context.log, request.caller.thread);

  const group = buildWriteGroup(request.caller, newest);

  if (gate.status === 'pass') {
    return applyPassedRetirement(parts, request, { gate, group, itemText });
  }

  return writeRetirementProposal(parts, request, { review: gate, group, itemText });
}

interface PassedRetirement {
  readonly gate: Extract<ContentGateResult, { readonly status: 'pass' }>;
  readonly group: WriteGroup;
  readonly itemText: string;
}

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

      ...(evidence === null || request.intentQuote === undefined
        ? {}
        : { intentQuote: request.intentQuote, intentEvidence: evidence }),
    },
    {
      noticeKey: passed.group.noticeKey,
      requireInTransaction: async (db) => {
        requireCheckerSnapshot(parts.context, passed.gate.checks);

        if (evidence !== null) {
          await requireLiveEvidence(db, evidence.recordSequence);
        }
      },
    },
  );

  return { status: 'applied', itemID: ref.itemID, version: ref.version };
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
