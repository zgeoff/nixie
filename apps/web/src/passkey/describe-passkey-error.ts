import { ORPCError } from '@orpc/client';

const words: Readonly<Record<string, string>> = {
  CODE_REQUIRED: 'Enter the code that nixie passkey-code prints on the host.',
  CODE_INVALID: 'That code is unknown, used or lapsed. Run nixie passkey-code for a new one.',
  NO_PASSKEY: 'No passkey is set up yet, so add the first one with a code from nixie passkey-code.',
  PASSKEY_FAILED: 'The passkey check did not pass, so nothing changed.',
  TOO_MANY_PASSKEYS: 'Ten passkeys are live already. Revoke one to add another.',
  ORIGIN_UNSUPPORTED:
    'A passkey needs this page to open on an https address with a domain name, not an IP address.',
  ORIGIN_CHANGED:
    'Live passkeys belong to another address. Revoke them with nixie passkeys, then add one here with a code.',
  REGISTRATION_FAILED: 'The passkey could not be added, so nothing changed. Try again.',
};

// One sentence for a failed passkey call or a prompt that was cancelled, so nothing fails silently.
export function describePasskeyError(error: unknown): string {
  if (error instanceof ORPCError) {
    return words[error.code] ?? 'The host refused this, so nothing changed.';
  }

  if (error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
    return 'The passkey prompt was cancelled, so nothing changed.';
  }

  return 'The passkey call did not finish, so nothing changed. Try again.';
}
