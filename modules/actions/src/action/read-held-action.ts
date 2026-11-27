import type { JSONObject } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { ActionsTables } from '../types';
import { buildCancelledCheck } from './build-cancelled-check';
import type { ApprovedActionContext } from './create-approved-action';
import { isJSONObject } from './is-json-object';

// The action that a proposal holds: the hash it is queued under and the arguments of the record
// that queued it, which are null once a forget has shredded them.
export interface HeldAction {
  readonly actionID: string;
  readonly actionHash: string;
  readonly arguments: JSONObject | null;
}

export interface HeldActionRequest {
  readonly actionID: string;
  readonly proposalID: string;
}

// Null when no action of that ID waits behind that proposal, such as one a decline already failed
// or a stop cancelled, because the queue never claims a cancelled action.
export async function readHeldAction(
  tx: Transaction<unknown>,
  context: Pick<ApprovedActionContext, 'log'>,
  request: HeldActionRequest,
): Promise<HeldAction | null> {
  const row = await tx
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select(['action_id', 'action_hash', 'queued_sequence'])
    .where('action_id', '=', request.actionID)
    .where('held_by_proposal_id', '=', request.proposalID)
    .where((eb) => eb.not(buildCancelledCheck(eb)))
    .executeTakeFirst();

  if (row === undefined) {
    return null;
  }

  const [entry] = await readRecords(
    { ...context.log, writer: { ...context.log.writer, db: tx } },
    { afterSequence: row.queued_sequence - 1, limit: 1 },
  );

  const erasable = entry?.record.erasable;
  const args = erasable?.status === 'readable' ? erasable.fields['arguments'] : undefined;

  return {
    actionID: row.action_id,
    actionHash: row.action_hash,
    arguments: isJSONObject(args) ? args : null,
  };
}
