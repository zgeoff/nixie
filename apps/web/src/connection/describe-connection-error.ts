import { ORPCError } from '@orpc/client';

const words: Readonly<Record<string, string>> = {
  INVALID_ORIGIN:
    'The origin must be an https address with no path, and the page must be open on it.',
  CLIENT_EXISTS: 'A client is registered already. Remove it to register another.',
  CLIENT_NOT_FOUND: 'No client is registered. Reload the page.',
  CLIENT_IN_USE:
    'A connection or a consent that has not lapsed uses this client. Forget the connections first.',
  CLIENT_MISSING: 'Register an OAuth client before you connect an account.',
  CONNECTION_NOT_FOUND: 'This connection no longer exists. Reload the page.',
  CONNECTIONS_NOT_STARTED: 'nixie has not started its connections yet. Try again in a moment.',
};

// One sentence for a failed connections call, so nothing fails silently.
export function describeConnectionError(error: unknown): string {
  if (error instanceof ORPCError) {
    const code: unknown = error.code;

    return (
      (typeof code === 'string' ? words[code] : undefined) ??
      'nixie refused this, so nothing changed.'
    );
  }

  return 'nixie did not answer, so this may or may not have changed. Reload the page before you try again.';
}
