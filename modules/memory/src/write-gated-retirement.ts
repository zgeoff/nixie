import type { WriteGroup } from './build-write-group';
import { buildWriteGroup } from './build-write-group';
import { findNewestMessage } from './find-newest-message';
import type { ContentGateResult, GatedRetireRequest, WriteOutcome } from './gate-types';
import { readItemText } from './read-item-text';
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
    return applyRetirement(parts, request, { gate, group });
  }
  const proposalID = await writeMemoryProposal(parts, {
    operation: 'retire',
    target: request.target,
    isPinned: false,
    text: itemText,
    quote: request.intentQuote ?? null,
    reason: gate.reason,
    evidence: gate.evidence,
    checks: gate.checks,
    checkerReason: gate.checkerReason,
    caller: request.caller,
    group,
  });

  return { status: 'proposed', proposalID, reason: gate.reason };
}

interface PassedRetirement {
  readonly gate: Extract<ContentGateResult, { readonly status: 'pass' }>;
  readonly group: WriteGroup;
}

async function applyRetirement(
  parts: StoreParts,
  request: GatedRetireRequest,
  passed: PassedRetirement,
): Promise<WriteOutcome> {
  const caller = request.caller;
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
      ...(passed.gate.evidence === null ? {} : { intentEvidence: passed.gate.evidence }),
    },
    { noticeKey: passed.group.noticeKey },
  );

  return { status: 'applied', itemID: ref.itemID, version: ref.version };
}
