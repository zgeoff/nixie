import { buildWriteGroup } from './build-write-group';
import type { GatedPinRequest, WriteOutcome } from './gate-types';
import { readItemText } from './read-item-text';
import { readNewestMessage } from './read-newest-message';
import type { StoreParts } from './types';
import { writeMemoryProposal } from './write-memory-proposal';
import { writePin } from './write-pin';

export async function writeGatedPin(
  parts: StoreParts,
  request: GatedPinRequest,
): Promise<WriteOutcome> {
  const item = await readItemText(parts, request.target, 'pin');

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
