import type { APIContext, APITables } from '../types';

type LiveFields = Pick<APITables['identities'], 'revoked_at' | 'last_seen_at'>;

// A session is live until its owner revokes it or it sits idle past the idle limit.
export function isSessionLive(
  context: Pick<APIContext, 'clock' | 'settings'>,
  row: LiveFields,
): boolean {
  return (
    row.revoked_at === null &&
    context.clock.now() - row.last_seen_at <= context.settings.sessionIdleMs
  );
}
