import { createShortID } from '@heynixie/db';
import {
  buildTransactionLog,
  withWriteTransaction,
  writeRecordsInTransaction,
} from '@heynixie/log';
import type { WriteTransaction } from '@heynixie/log';
import { phoneSendClaimedCodec } from '../record/phone-send-claimed-codec';
import { readSendClaim } from '../store/read-send-claim';
import type { PhoneContext, PhoneTables, ProviderSentText, TextRequest } from '../types';
import { pickSendSettlement } from './pick-send-settlement';
import { readOpenSends } from './read-open-sends';

export type SendSettlement =
  | { readonly kind: 'claimed'; readonly shortID: string }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'inconclusive' };

export interface SendLook {
  readonly actionID: string;
  readonly request: TextRequest;

  // epoch ms when the attempt began
  readonly attemptStartedAt: number;

  // the provider's messages that match the send
  readonly candidates: readonly ProviderSentText[];
}

// Settles a send of unknown outcome on one message, in one write transaction so no 2 sends claim the
// same message. The transaction reads the claims and the other begun sends itself, so a send that
// begins while it runs shows in the read or finds the claim afterwards.
export function settleSendClaim(context: PhoneContext, look: SendLook): Promise<SendSettlement> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const log = buildTransactionLog(context.log, tx);

    const own = await readSendClaim(log, look.actionID);

    if (own !== null) {
      return { kind: 'claimed', shortID: own };
    }

    const claimed = await tx
      .$extendTables<PhoneTables>()
      .selectFrom('phone_send_claims')
      .select('message_id')
      .where(
        'message_id',
        'in',
        look.candidates.map((candidate) => candidate.messageID),
      )
      .execute();

    const picked = pickSendSettlement({
      request: look.request,
      attemptStartedAt: look.attemptStartedAt,
      candidates: look.candidates,
      claimedMessageIDs: claimed.map((claim) => claim.message_id),
      open: await readOpenSends(log, look.actionID),
    });

    if (picked.kind !== 'claim') {
      return picked;
    }

    return {
      kind: 'claimed',
      shortID: await writeSendClaim(tx, context, look.actionID, picked.messageID),
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
    const own = await readSendClaim(buildTransactionLog(context.log, tx), actionID);

    return own ?? writeSendClaim(tx, context, actionID, messageID);
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
