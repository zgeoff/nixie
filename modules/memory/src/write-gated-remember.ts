import type { WriteGroup } from './build-write-group';
import { buildWriteGroup } from './build-write-group';
import { findNewestMessage } from './find-newest-message';
import type { ContentGateResult, GatedRememberRequest, WriteOutcome } from './gate-types';
import { requireItem } from './require-item';
import { runContentGate } from './run-content-gate';
import type { MemoryTables, StoreParts } from './types';
import { writeMemoryProposal } from './write-memory-proposal';
import { writeRememberedItem } from './write-remembered-item';

// Runs a memory.remember through the content gate. A write that passes applies at once under its
// turn's notice, and every other write becomes a proposal, a missing quote included. An edit of a
// missing item or a moved-on version is refused before any check runs.
export async function writeGatedRemember(
  parts: StoreParts,
  request: GatedRememberRequest,
): Promise<WriteOutcome> {
  if (request.target !== undefined) {
    await requireItem(parts.context.log.writer.db.$extendTables<MemoryTables>(), {
      target: request.target,
      operation: 'edit',
      states: ['active', 'retired'],
    });
  }
  const gate = await runContentGate(parts.context, {
    text: request.text,
    quote: request.quote ?? null,
    isPinned: request.isPinned === true,
    thread: request.caller.thread,
  });
  const newest = await findNewestMessage(parts.context.log, request.caller.thread);
  const group = buildWriteGroup(request.caller, newest);

  if (gate.status === 'pass') {
    return applyRemember(parts, request, { gate, group });
  }
  const proposalID = await writeMemoryProposal(parts, {
    operation: 'remember',
    target: request.target ?? null,
    isPinned: request.isPinned === true,
    text: request.text,
    quote: request.quote ?? null,
    reason: gate.reason,
    evidence: gate.evidence,
    checks: gate.checks,
    checkerReason: gate.checkerReason,
    caller: request.caller,
    group,
  });

  return { status: 'proposed', proposalID, reason: gate.reason };
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
    { noticeKey: passed.group.noticeKey },
  );

  return { status: 'applied', itemID: ref.itemID, version: ref.version };
}
