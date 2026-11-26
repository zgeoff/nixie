import { z } from 'zod';
import type { ServiceContext } from '../service-context';
import type { ConnectionState } from '../types';
import { pickConnectionStatus } from './pick-connection-status';
import { readConnectionRows } from './read-connection-rows';

const scopesSchema = z.array(z.string());

// Each connection that is not forgotten, with its status and the scopes it was granted: what a
// background reader of a connection needs to pick the ones it may use.
export async function readConnectionStates(context: ServiceContext): Promise<ConnectionState[]> {
  const rows = await readConnectionRows(context.log);

  return rows.flatMap((row) => {
    const status = pickConnectionStatus({
      binding: row.binding,
      status: row.status,
      refreshExpiresAtMs: row.refresh_expires_at,
      nowMs: context.now(),
    });

    return status === 'forgotten'
      ? []
      : [
          {
            connectionID: row.connection_id,
            connection: row.short_id,
            status,
            scopes: scopesSchema.parse(JSON.parse(row.granted_scopes)),
          },
        ];
  });
}
