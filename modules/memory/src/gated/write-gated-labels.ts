import type { RuleNeed } from '@heynixie/policy';
import { buildAskReview } from '../gate/build-ask-review';
import { buildRuleGate } from '../gate/build-rule-gate';
import { findMissingToken } from '../gate/find-missing-token';
import type { ContentGateResult, GatedLabelEditRequest, WriteOutcome } from '../gate/gate-context';
import type { CoveringRule } from '../gate/pick-covering-rule';
import { pickCoveringRule } from '../gate/pick-covering-rule';
import { collectLabelTexts } from '../label/collect-label-texts';
import { writeLabelEdit } from '../label/write-label-edit';
import { writeMemoryProposal } from '../memory/write-memory-proposal';
import { readNewestMessage } from '../message/read-newest-message';
import { requireGrantedSelfSubject } from '../subject/require-granted-self-subject';
import { requireSelfNoteCaller } from '../subject/require-self-note-caller';
import type { MemoryTables, StoreParts } from '../types';
import { getRowSubject } from '../utils/get-row-subject';
import { requireItem } from '../utils/item/require-item';
import { readVersion } from '../version/read-version';
import { buildWriteGroup } from '../write/build-write-group';

// No quote can back a label, so the gate runs no quote check and no checker. Without a covering
// rule, it checks the labels' tokens against the text of the item the labels belong to.
export async function writeGatedLabels(
  parts: StoreParts,
  request: GatedLabelEditRequest,
): Promise<WriteOutcome> {
  const log = parts.context.log;
  const db = log.writer.db.$extendTables<MemoryTables>();

  const item = await requireItem(db, {
    target: request.target,
    operation: 'edit',
    states: ['active', 'retired'],
  });

  const subject = getRowSubject(item);

  requireGrantedSelfSubject(request.caller, [subject]);

  const need: RuleNeed = subject === 'self' ? 'self_note' : 'none';
  const covering = pickCoveringRule(request.verdict, need);

  if (covering === null && subject === 'self') {
    requireSelfNoteCaller(request.caller);
  }

  const caller = request.caller;

  const newest = await readNewestMessage(log, caller.thread);

  const group = buildWriteGroup(caller, newest);

  const current = await readVersion(log, log.writer.db, {
    itemID: item.item_id,
    version: item.version,
  });

  const labelTexts = collectLabelTexts(request.labels);
  const gate = pickLabelGate(request, { covering, labelTexts, itemText: current.text.text });

  if (gate.status === 'pass') {
    const ref = await writeLabelEdit(parts, {
      target: request.target,
      labels: request.labels,
      provenance: {
        origin: caller.origin,
        source: gate.source,
        taskID: caller.taskID,
        proposalID: null,
        checks: gate.checks,
        thread: caller.thread,
        model: caller.model,
      },
      noticeKey: group.noticeKey,
    });

    return { status: 'applied', ...ref };
  }

  const written = await writeMemoryProposal(parts, {
    operation: 'remember',
    target: { itemID: item.item_id, version: item.version },
    isPinned: false,
    text: current.text.text,
    quote: null,
    reason: gate.reason,
    evidence: null,
    checks: gate.checks,
    checkerReason: null,
    caller,
    group,
    labels: request.labels,
    targetRevision: request.target.version,
    isLabelOnly: true,
  });

  return { status: 'proposed', ...written, reason: gate.reason };
}

interface LabelGateFacts {
  readonly covering: CoveringRule | null;
  readonly labelTexts: readonly string[];
  readonly itemText: string;
}

const invisible = /\p{Cf}/u;

function pickLabelGate(request: GatedLabelEditRequest, facts: LabelGateFacts): ContentGateResult {
  const verdict = request.verdict;

  if (verdict?.kind === 'rule-ask') {
    return buildAskReview(verdict.rule);
  }

  if (facts.covering !== null) {
    return buildRuleGate({ text: '', labelTexts: facts.labelTexts }, facts.covering);
  }

  const labelText = facts.labelTexts.join('\n');
  const tokens = findMissingToken(labelText, facts.itemText) === null ? 'pass' : 'fail';

  return {
    status: 'review',
    reason: invisible.test(labelText) ? 'invisible_character' : 'labels',
    evidence: null,
    checks: { tokens },
    checkerReason: null,
  };
}
