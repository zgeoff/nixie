import { createShortID } from '@heynixie/db';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { WriteTransaction } from '@heynixie/log';
import { phoneSendClaimedCodec } from '../record/phone-send-claimed-codec';
import type { PhoneContext, PhoneTables, TextRequest } from '../types';

export type SendSettlement =
  | { readonly kind: 'claimed'; readonly shortID: string }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'inconclusive' };

export interface SendLook {
  readonly actionID: string;
  readonly request: TextRequest;

  // the provider's messages that match the send
  readonly candidates: readonly string[];

  // the sends that have begun, which the caller read before the transaction
  readonly open: readonly TextRequest[];
}

// Settles a send of unknown outcome on one message, in one write transaction so no 2 sends claim the
// same message. It claims only when exactly one candidate has no claim and no other begun send
// carries the same number and body, because a match cannot show which of 2 identical sends made it.
export function settleSendClaim(context: PhoneContext, look: SendLook): Promise<SendSettlement> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const db = tx.$extendTables<PhoneTables>();

    const own = await db
      .selectFrom('phone_send_claims')
      .select('short_id')
      .where('action_id', '=', look.actionID)
      .executeTakeFirst();

    if (own !== undefined) {
      return { kind: 'claimed', shortID: own.short_id };
    }

    if (look.candidates.length === 0) {
      return { kind: 'not_found' };
    }

    const claimed = await db
      .selectFrom('phone_send_claims')
      .select('message_id')
      .where('message_id', 'in', look.candidates)
      .execute();

    const free = look.candidates.filter(
      (messageID) => !claimed.some((claim) => claim.message_id === messageID),
    );

    const [messageID] = free;

    if (free.length !== 1 || messageID === undefined) {
      return { kind: 'inconclusive' };
    }

    if (
      look.open.some((other) => other.to === look.request.to && other.body === look.request.body)
    ) {
      return { kind: 'inconclusive' };
    }

    return {
      kind: 'claimed',
      shortID: await writeSendClaim(tx, context, look.actionID, messageID),
    };
  });
}

// Claims the message that the provider answered a send with. The answer names the message, so no
// look at the provider's list is needed.
export function claimSentMessage(
  context: PhoneContext,
  actionID: string,
  messageID: string,
): Promise<string> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const own = await tx
      .$extendTables<PhoneTables>()
      .selectFrom('phone_send_claims')
      .select('short_id')
      .where('action_id', '=', actionID)
      .executeTakeFirst();

    return own?.short_id ?? writeSendClaim(tx, context, actionID, messageID);
  });
}

async function writeSendClaim(
  tx: WriteTransaction,
  context: PhoneContext,
  actionID: string,
  messageID: string,
): Promise<string> {
  const shortID = createShortID();

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: phoneSendClaimedCodec.kind,
      definitions: context.definitions(),
      payload: phoneSendClaimedCodec.encode({ actionID, messageID, shortID }),
    },
  ]);

  return shortID;
}
