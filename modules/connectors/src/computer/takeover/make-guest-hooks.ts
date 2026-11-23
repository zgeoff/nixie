import type { CallResult, ComputerCall } from '../types';
import type { HandBackRead } from './types';

export interface GuestHooksHost {
  readonly hasGuest: () => boolean;

  // runs a call of the hold's own, which takes its turn as any call does
  readonly runHoldCall: (request: ComputerCall['request']) => Promise<CallResult>;

  readonly tabs: {
    readonly findGuest: (guestTab: string) => string | null;
    readonly add: (guestTab: string) => string;
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

      const now = result.reply.now;

      if (now.kind !== 'browser') {
        return { origins: result.reply.origins, now };
      }

      const tab = host.tabs.findGuest(now.tab) ?? host.tabs.add(now.tab);

      return { origins: result.reply.origins, now: { ...now, tab } };
    },
  };
}
