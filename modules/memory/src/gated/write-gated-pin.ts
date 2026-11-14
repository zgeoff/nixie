import type { GatedPinRequest, WriteOutcome } from '../gate/gate-context';
import { readItemText } from '../item/read-item-text';
import { writeMemoryProposal } from '../memory/write-memory-proposal';
import { readNewestMessage } from '../message/read-newest-message';
import { writePin } from '../pin/write-pin';
import type { StoreParts } from '../types';
import { MemoryStateError } from '../utils/error/memory-state-error';
import { isItemLapsed } from '../utils/item/is-item-lapsed';
import { buildWriteGroup } from '../write/build-write-group';

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

  const rule = await parts.context.gate.findAllowRule({
    tool: 'memory.pin',
    thread: caller.thread,
  });

  if (rule !== null) {
    await writePin(parts, {
      itemID: request.target.itemID,
      isPinned: true,
      version: request.target.version,
      provenance: {
        origin: caller.origin,
        source: 'untrusted',
        taskID: caller.taskID,
        proposalID: null,
        checks: { rule: { id: rule.ruleID, revision: rule.revision } },
        thread: caller.thread,
        model: caller.model,
      },
    });

    return applied;
  }

  const newest = await readNewestMessage(parts.context.log, caller.thread);

  const written = await writeMemoryProposal(parts, {
    operation: 'pin',
    target: request.target,
    isPinned: true,
    text: item.text,
    quote: null,
    reason: 'pinned',
    evidence: null,
    checks: { pin: 'review' },
    checkerReason: null,
    caller,
    group: buildWriteGroup(caller, newest),
  });

  return { status: 'proposed', ...written, reason: 'pinned' };
}
