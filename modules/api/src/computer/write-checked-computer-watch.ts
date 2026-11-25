import type { APIContext, Identity } from '../types';
import type { WatchTickets } from './create-watch-tickets';
import { writeCheckedComputerAction } from './write-checked-computer-action';

export type CheckedComputerWatchResult =
  | { readonly status: 'minted'; readonly ticket: string }
  | { readonly status: 'reused' }
  | { readonly status: 'unauthorized' };

// The stored result says only that a ticket was minted. The ticket is a secret that nixie keeps in
// memory, so a retry of the same action gets a new one, and no retry can return a spent, lapsed or
// pre-restart ticket.
export async function writeCheckedComputerWatch(
  context: APIContext,
  tickets: WatchTickets,
  caller: Identity,
  clientActionID: string,
): Promise<CheckedComputerWatchResult> {
  const checked = await writeCheckedComputerAction(context, caller, {
    procedure: 'computer.watch',
    input: {},
    clientActionID,
    result: { minted: true },
  });

  return checked.status === 'allowed'
    ? { status: 'minted', ticket: tickets.mint(caller.identityID) }
    : { status: checked.status };
}
