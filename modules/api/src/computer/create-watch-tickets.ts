import type { APIContext } from '../types';

export interface WatchTickets {
  // Mints a ticket for a session. The ticket is 32 random bytes in base64url, kept in memory only,
  // and works for the lifetime below.
  readonly mint: (identityID: string) => string;

  // Spends a ticket and returns the session it was minted for, or null when it is unknown, spent or
  // expired. A ticket is gone after its first redeem, whatever the answer.
  readonly redeem: (ticket: string) => string | null;
}

interface MintedTicket {
  readonly identityID: string;
  readonly expiresAtMs: number;
}

// how long a ticket opens a socket after the call that minted it
export const watchTicketLifetimeMs = 30_000;

// The tickets die with the process, so a restart leaves no ticket that works.
export function createWatchTickets(clock: Pick<APIContext['clock'], 'now'>): WatchTickets {
  const minted = new Map<string, MintedTicket>();

  return {
    mint: (identityID) => {
      const now = clock.now();

      for (const [ticket, entry] of minted) {
        if (entry.expiresAtMs < now) {
          minted.delete(ticket);
        }
      }

      const ticket = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');

      minted.set(ticket, { identityID, expiresAtMs: now + watchTicketLifetimeMs });

      return ticket;
    },
    redeem: (ticket) => {
      const entry = minted.get(ticket);

      minted.delete(ticket);

      return entry !== undefined && clock.now() <= entry.expiresAtMs ? entry.identityID : null;
    },
  };
}
