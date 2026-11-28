import type { LogRecord } from '@heynixie/log';
import { parseJSONObject } from '@heynixie/log';
import type { ProposalRefusal, SharedProposal } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { hasQueuedEffect } from '../utils/has-queued-effect';
import { toCanonicalText } from '../utils/to-canonical-text';
import type { actionProposedCodec } from './action-proposed-codec';
import { buildActionHash } from './build-action-hash';
import type { ProposedFields } from './find-erasable';
import { findErasable, toJSONObject } from './find-erasable';
import type { ActionHandlerDeps } from './make-action-proposal-handler';

export interface QueueRequest {
  readonly row: SharedProposal;
  readonly proposed: LogRecord;
  readonly payload: ReturnType<typeof actionProposedCodec.decode>;
}

// What stops an approval from queueing its action, checked before the answer writes anything.
export function checkApproval(
  deps: ActionHandlerDeps,
  tx: Transaction<unknown>,
  request: QueueRequest,
): Promise<ProposalRefusal | null> {
  const row = request.row;
  const payload = request.payload;
  const erasable = findErasable(request.proposed);

  // A forget shreds the arguments, and an action without them would run another.
  if (erasable === null || row.thread === null) {
    return Promise.resolve({ error: 'NOT_ALLOWED', reason: 'arguments_gone' });
  }

  return payload.actionID === undefined
    ? Promise.resolve(checkRebuiltHash(row, payload, erasable))
    : checkHeldAction(deps, tx, { row, actionID: payload.actionID, erasable });
}

// An approval queues the action it answered, once: the answer's transaction is the guard, because a
// second answer finds the row closed.
export async function queueAction(
  deps: ActionHandlerDeps,
  tx: Transaction<unknown>,
  request: QueueRequest,
): Promise<{ readonly actionID: string }> {
  const row = request.row;
  const payload = request.payload;
  const erasable = findErasable(request.proposed);

  invariant(
    erasable !== null && row.thread !== null,
    'an approval checks the arguments before it queues',
  );

  const actionID = await deps.queueApproved(tx, {
    proposalID: row.id,
    taskID: row.thread,
    stepKey: payload.stepKey ?? null,
    tool: toCalledTool(payload.tool),
    effects: payload.effects,
    actionHash: row.actionHash,
    arguments: toJSONObject(erasable.input),
    callSequence: payload.callSequence,
    riskClass: row.riskClass,
    deadlineAt: payload.deadlineAt ?? null,
    runsInStep: !hasQueuedEffect(payload.effects),
  });

  return { actionID };
}

// An ask that a call made holds no action yet, so its approval rebuilds the hash that the call
// was hashed under.
function checkRebuiltHash(
  row: SharedProposal,
  payload: QueueRequest['payload'],
  erasable: ProposedFields,
): ProposalRefusal | null {
  const hash = buildActionHash({
    tool: toCalledTool(payload.tool),
    input: toJSONObject(erasable.input),
    destinations: erasable.destinations.map((destination) => destination.value),
    deadlineAt: payload.deadlineAt ?? null,
    expectURL: payload.expectURL,
    expectWindow:
      payload.expectWindow === undefined ? undefined : parseJSONObject(payload.expectWindow),
  });

  return hash === row.actionHash ? null : { error: 'NOT_ALLOWED', reason: 'action_changed' };
}

// A proposal names the variant that the call's input picked, as `<tool>/<variant>`. The call, its
// hash and its action carry the tool's own name.
function toCalledTool(proposed: string): string {
  const slash = proposed.indexOf('/');

  return slash === -1 ? proposed : proposed.slice(0, slash);
}

interface HeldCheck {
  readonly row: SharedProposal;
  readonly actionID: string;
  readonly erasable: ProposedFields;
}

// An ask that reopens an action answers that action, whose queue hashed it its own way. The
// approval stands only while the action still holds the hash and the arguments that the card showed.
async function checkHeldAction(
  deps: ActionHandlerDeps,
  tx: Transaction<unknown>,
  check: HeldCheck,
): Promise<ProposalRefusal | null> {
  const held = await deps.readHeldAction(tx, {
    actionID: check.actionID,
    proposalID: check.row.id,
  });

  if (held === null) {
    return { error: 'NOT_ALLOWED', reason: 'held_action_gone' };
  }

  if (held.arguments === null) {
    return { error: 'NOT_ALLOWED', reason: 'arguments_gone' };
  }

  const isSame =
    held.actionHash === check.row.actionHash &&
    toCanonicalText(held.arguments) === toCanonicalText(toJSONObject(check.erasable.input));

  return isSame ? null : { error: 'NOT_ALLOWED', reason: 'action_changed' };
}
