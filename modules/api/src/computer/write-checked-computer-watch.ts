import { withWriteTransaction } from '@heynixie/log';
import type { APIContext, Identity } from '../types';
import { buildInputHash } from '../utils/build-input-hash';
import { probeLiveIdentity } from '../utils/probe-live-identity';
import { readClientAction } from '../utils/read-client-action';
import { writeClientAction } from '../utils/write-client-action';
import type { WatchTickets } from './create-watch-tickets';

export type CheckedComputerWatchResult =
  | { readonly status: 'minted'; readonly ticket: string }
  | { readonly status: 'reused' }
  | { readonly status: 'unauthorized' };

const procedure = 'computer.watch';

// The stored result says only that a ticket was minted. The ticket is a secret that nixie keeps in
// memory, so a retry of the same action gets a new one, and no retry can return a spent, lapsed or
// pre-restart ticket.
export async function writeCheckedComputerWatch(
  context: APIContext,
  tickets: WatchTickets,
  caller: Identity,
  clientActionID: string,
): Promise<CheckedComputerWatchResult> {
  const inputHash = buildInputHash({});

  const isAllowed = await withWriteTransaction(context.log.writer, async (tx) => {
    const [live, earlier] = await Promise.all([
      probeLiveIdentity(tx, context, caller.identityID),
      readClientAction(tx, clientActionID),
    ]);

    if (!live) {
      return 'unauthorized' as const;
    }

    if (earlier !== null) {
      const isSameAction =
        earlier.procedure === procedure &&
        earlier.identityID === caller.identityID &&
        earlier.inputHash === inputHash;

      return isSameAction ? ('allowed' as const) : ('reused' as const);
    }

    await writeClientAction(tx, {
      clientActionID,
      procedure,
      identityID: caller.identityID,
      inputHash,
      result: { minted: true },
      recordedAt: context.clock.now(),
    });

    return 'allowed' as const;
  });

  return isAllowed === 'allowed'
    ? { status: 'minted', ticket: tickets.mint(caller.identityID) }
    : { status: isAllowed };
}
