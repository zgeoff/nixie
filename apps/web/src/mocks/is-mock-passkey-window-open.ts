import { store } from './store';

// Whether the tap of an earlier answer still covers a check, as the host reports it. The mock never
// lets the window lapse, and a check that adds or removes a passkey is never covered.
export function isMockPasskeyWindowOpen(kind: string): boolean {
  return kind !== 'register' && kind !== 'revoke' && store.passkeyChecks.all().length > 0;
}
