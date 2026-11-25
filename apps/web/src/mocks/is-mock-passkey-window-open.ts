import { store } from './store';

// Whether the tap of an earlier answer still covers a check, as the host reports it. The window lasts
// until a test closes it, and a check that adds or removes a passkey is never covered.
export function isMockPasskeyWindowOpen(kind: string): boolean {
  return (
    kind !== 'register' &&
    kind !== 'revoke' &&
    store.passkeyChecks.all().some((check) => check.isCovering)
  );
}
