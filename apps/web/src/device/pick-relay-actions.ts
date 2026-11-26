import { match } from 'ts-pattern';
import type { DeviceRelayMessage } from './parse-device-relay-message';
import type { DeviceEvents } from './types';

export type RelayAction =
  | { readonly kind: 'stepDown' }

  // post what this tab's stream shows
  | { readonly kind: 'announce' }

  // tell a probing tab that this tab holds the stream
  | { readonly kind: 'answer' }

  // a holder is there, so this tab need not take the stream
  | { readonly kind: 'heard' }
  | { readonly kind: 'mirror'; readonly events: DeviceEvents }

  // the holder left, so the tabs choose another
  | { readonly kind: 'elect' };

export interface RelayRole {
  readonly tab: string;
  readonly isLeading: boolean;

  // false while a browser lock grants the stream, which no message takes away
  readonly canYield: boolean;
}

// Two tabs that take the stream at once both hear the other, and the one with the greater tab ID
// gives it up, so the browser ends with one holder.
export function pickRelayActions(
  message: DeviceRelayMessage,
  role: RelayRole,
): readonly RelayAction[] {
  return match(message)
    .with({ kind: 'join' }, () => (role.isLeading ? [{ kind: 'announce' } as const] : []))
    .with({ kind: 'probe' }, () => (role.isLeading ? [{ kind: 'answer' } as const] : []))
    .with({ kind: 'here' }, () => (role.isLeading ? [] : [{ kind: 'heard' } as const]))
    .with({ kind: 'resign' }, () => (role.isLeading ? [] : [{ kind: 'elect' } as const]))
    .with({ kind: 'leader' }, (leader): readonly RelayAction[] => {
      const mirror = [{ kind: 'heard' }, { kind: 'mirror', events: leader.events }] as const;

      if (!role.isLeading) {
        return mirror;
      }

      if (!role.canYield) {
        return [];
      }

      return leader.tab < role.tab ? [{ kind: 'stepDown' }, ...mirror] : [{ kind: 'announce' }];
    })
    .exhaustive();
}
