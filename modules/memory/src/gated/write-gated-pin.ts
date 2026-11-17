import type { RuleNeed } from '@heynixie/policy';
import type { GatedPinRequest, ReviewReason, WriteOutcome } from '../gate/gate-context';
import { pickCoveringRule } from '../gate/pick-covering-rule';
import { readItemText } from '../item/read-item-text';
import { writeMemoryProposal } from '../memory/write-memory-proposal';
import { readNewestMessage } from '../message/read-newest-message';
import { writePin } from '../pin/write-pin';
import type { StoreParts } from '../types';
import { MemoryStateError } from '../utils/error/memory-state-error';
import { isItemLapsed } from '../utils/item/is-item-lapsed';
import { buildWriteGroup } from '../write/build-write-group';

// Without an allow rule that covers it, a pin waits for review. A covering rule applies the pin at
// once, with a notice, and an ask rule makes it a proposal that says so. A pin adds no text, so it
// runs no content check.
export async function writeGatedPin(
  parts: StoreParts,
  request: GatedPinRequest,
): Promise<WriteOutcome> {
  const item = await readItemText(parts, request.target, 'pin');

  if (isItemLapsed({ state: 'active', until: item.until }, parts.context.gate.clock.now())) {
    throw new MemoryStateError(request.target.itemID, 'pin', 'retired');
  }

  const applied = { status: 'applied' as const, ...request.target };

  if (item.isPinned) {
    return applied;
  }

  const caller = request.caller;
  const verdict = request.verdict;
  const need: RuleNeed = item.subject === 'self' ? 'self_note' : 'none';
  const covering = pickCoveringRule(verdict, need);

  const newest = await readNewestMessage(parts.context.log, caller.thread);

  const group = buildWriteGroup(caller, newest);

  if (covering !== null) {
    await writePin(parts, {
      itemID: request.target.itemID,
      isPinned: true,
      version: request.target.version,
      provenance: {
        origin: caller.origin,
        source: 'untrusted',
        taskID: caller.taskID,
        proposalID: null,
        checks: { rule: { id: covering.id, revision: covering.revision } },
        thread: caller.thread,
        model: caller.model,
      },
      noticeKey: group.noticeKey,
    });

    return applied;
  }

  const rule = verdict?.kind === 'rule-ask' ? verdict.rule : null;
  const reason: ReviewReason = rule === null ? 'pinned' : 'ask_rule';

  const written = await writeMemoryProposal(parts, {
    operation: 'pin',
    target: { itemID: request.target.itemID, version: item.version },
    isPinned: true,
    text: item.text,
    quote: null,
    reason,
    evidence: null,
    checks: rule === null ? { pin: 'review' } : { rule: { id: rule.id, revision: rule.revision } },
    checkerReason: null,
    caller,
    group,
  });

  return { status: 'proposed', ...written, reason };
}
