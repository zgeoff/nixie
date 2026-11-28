import { pickConnectionStatus } from '../connection/pick-connection-status';
import { readConnectionRowByID } from '../connection/read-connection-rows';
import type { ServiceContext } from '../service-context';

// Whether a connection is in a break now: `failing`, or `needs_consent`. A healthy, expiring or gone
// connection is not.
export async function probeConnectionBroken(
  context: ServiceContext,
  connectionID: string,
): Promise<boolean> {
  const row = await readConnectionRowByID(context.log, connectionID);

  if (row === null) {
    return false;
  }

  const status = pickConnectionStatus({
    binding: row.binding,
    status: row.status,
    refreshExpiresAtMs: row.refresh_expires_at,
    nowMs: context.now(),
  });

  return status === 'failing' || status === 'needs_consent';
}
