import type { RuleNeed } from '@heynixie/policy';
import { requireLiveEvidence } from '../evidence/require-live-evidence';
import { requireUnforgottenQuote } from '../evidence/require-unforgotten-quote';
import { buildAskReview } from '../gate/build-ask-review';
import type { ContentGateResult, GatedRetireRequest, WriteOutcome } from '../gate/gate-context';
import { hasSelfNoteGrant } from '../gate/has-self-note-grant';
import { pickCoveringRule } from '../gate/pick-covering-rule';
import { runIntentGate } from '../gate/run-intent-gate';
import { readItemText } from '../item/read-item-text';
import { writeMemoryProposal } from '../memory/write-memory-proposal';
import { readNewestMessage } from '../message/read-newest-message';
import { writeRetirement } from '../retirement/write-retirement';
import type { StoreParts, VersionRef } from '../types';
import { requireCheckerSnapshot } from '../utils/checker/require-checker-snapshot';
import { ForgottenEvidenceError } from '../utils/error/forgotten-evidence-error';
import type { WriteGroup } from '../write/build-write-group';
import { buildWriteGroup } from '../write/build-write-group';

export async function writeGatedRetirement(
  parts: StoreParts,
  request: GatedRetireRequest,
): Promise<WriteOutcome> {
  const item = await readItemText(parts, request.target, 'retire');

  const itemText = item.text;
  const textTarget = { itemID: request.target.itemID, version: item.version };

  const gate = await runRetirementGate(parts, request, {
    textTarget,
    itemText,
    isSelfNote: item.subject === 'self',
  });

  const newest = await readNewestMessage(parts.context.log, request.caller.thread);

  const group = buildWriteGroup(request.caller, newest);

  if (gate.status === 'pass') {
    return applyPassedRetirement(parts, request, { gate, group, itemText, textTarget });
  }

  return writeRetirementProposal(parts, request, { review: gate, group, itemText, textTarget });
}

interface RetiredItem {
  readonly textTarget: VersionRef;
  readonly itemText: string;
  readonly isSelfNote: boolean;
}

const selfNoteRetirement: ContentGateResult = {
  status: 'pass',
  source: 'untrusted',
  evidence: null,
  checks: { selfNote: 'retired' },
};

function runRetirementGate(
  parts: StoreParts,
  request: GatedRetireRequest,
  item: RetiredItem,
): Promise<ContentGateResult> {
  const verdict = request.verdict;

  if (verdict?.kind === 'rule-ask') {
    return Promise.resolve(buildAskReview(verdict.rule));
  }

  if (
    item.isSelfNote &&
    (request.caller.origin === 'conversation' || hasSelfNoteGrant(request.caller))
  ) {
    return Promise.resolve(selfNoteRetirement);
  }

  const need: RuleNeed = item.isSelfNote ? 'self_note' : 'none';
  const covering = pickCoveringRule(verdict, need);

  if (covering !== null) {
    return Promise.resolve({
      status: 'pass',
      source: 'untrusted',
      evidence: null,
      checks: { rule: { id: covering.id, revision: covering.revision } },
    });
  }

  return runIntentGate(parts.context, {
    target: item.textTarget,
    intentQuote: request.intentQuote ?? null,
    thread: request.caller.thread,
    itemText: item.itemText,
  });
}

interface PassedRetirement {
  readonly gate: Extract<ContentGateResult, { readonly status: 'pass' }>;
  readonly group: WriteGroup;
  readonly itemText: string;
  readonly textTarget: VersionRef;
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
          await requireUnforgottenQuote(db, evidence.recordSequence);
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
  readonly textTarget: VersionRef;
}

async function writeRetirementProposal(
  parts: StoreParts,
  request: GatedRetireRequest,
  reviewed: ReviewedRetirement,
): Promise<WriteOutcome> {
  const review = reviewed.review;

  const written = await writeMemoryProposal(parts, {
    operation: 'retire',
    target: reviewed.textTarget,
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
