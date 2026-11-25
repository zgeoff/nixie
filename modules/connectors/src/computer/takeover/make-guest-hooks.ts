import type { CallResult, ComputerCall } from '../types';
import type { HandBackRead } from './types';

export interface GuestHooksHost {
  readonly hasGuest: () => boolean;

  // runs a call of the hold's own, which takes its turn as any call does
  readonly runHoldCall: (request: ComputerCall['request']) => Promise<CallResult>;

  readonly tabs: {
    readonly findGuest: (guestTab: string) => string | null;
    readonly add: (guestTab: string) => string;
    readonly clear: () => void;
  };
}

export interface GuestHooks {
  // tells the guest a hold begins
  readonly begin: () => Promise<void>;

  // What the guest saw during the hold, for the record that ends it. With no guest running there is
  // nothing to read, and none is started to read it.
  readonly finish: () => Promise<HandBackRead | null>;
}

export function makeGuestHooks(host: GuestHooksHost): GuestHooks {
  return {
    begin: async () => {
      await host.runHoldCall({ op: 'takeoverBegin' });
    },
    finish: async () => {
      if (!host.hasGuest()) {
        return null;
      }

      const result = await host.runHoldCall({ op: 'takeoverEnd' });

      if (result.status !== 'reply' || result.reply.kind !== 'takeover-ended') {
        return null;
      }

      const reply = result.reply;

      // a restarted browser reuses the guest's tab IDs for new tabs, so no earlier name still holds
      if (reply.isRestarted) {
        host.tabs.clear();
      }

      const tabs = reply.tabs.map((open) => ({
        tab: host.tabs.findGuest(open.tab) ?? host.tabs.add(open.tab),
        origin: open.origin,
      }));

      const now =
        reply.now.kind === 'browser'
          ? {
              ...reply.now,
              tab: host.tabs.findGuest(reply.now.tab) ?? host.tabs.add(reply.now.tab),
            }
          : reply.now;

      return { origins: reply.origins, tabs, isRestarted: reply.isRestarted, now };
    },
  };
}
