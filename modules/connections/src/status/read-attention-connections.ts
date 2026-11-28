import { z } from 'zod';
import { openConnectionValues } from '../connection/open-connection-values';
import { pickConnectionStatus } from '../connection/pick-connection-status';
import { readConnectionRows } from '../connection/read-connection-rows';
import type { ServiceContext } from '../service-context';
import type { ConnectionRow } from '../types';
import { collectRemovedToolNames } from './collect-removed-tool-names';
import { pickAttentionStatus } from './pick-attention-status';
import { pickStatusSince } from './pick-status-since';
import type { AttentionConnection, FailingReason } from './types';

// Each connection that is `needs_consent`, `failing` or `expiring`, in the order the connections
// were made. A forgotten connection never lists, and `scope` limits the list to the short IDs it
// holds, as a job run's pins do; null lists every connection.
export async function readAttentionConnections(
  context: ServiceContext,
  scope: ReadonlySet<string> | null,
): Promise<AttentionConnection[]> {
  const rows = await readConnectionRows(context.log);

  const enabled = rows.filter((row) => row.binding === 'enabled');

  const opened = await openConnectionValues(context.log, enabled);

  return enabled.flatMap((row): AttentionConnection[] => {
    const status = pickAttentionStatus(
      pickConnectionStatus({
        binding: row.binding,
        status: row.status,
        refreshExpiresAtMs: row.refresh_expires_at,
        nowMs: context.now(),
      }),
    );

    const values = opened.get(row.connection_id);
    const label = values?.label ?? null;
    const account = values?.account?.email ?? null;

    if (status === null || label === null || account === null) {
      return [];
    }

    if (scope !== null && !scope.has(row.short_id)) {
      return [];
    }

    return [
      {
        connection: row.short_id,
        connector: row.connector_id,
        label,
        account,
        status,
        reason: status === 'failing' ? readReason(row) : null,
        sinceMs: pickStatusSince(row, status),
        lastSuccessAtMs: row.last_success_at,
        removedTools: collectRemovedToolNames(status, context.connector.actions),
      },
    ];
  });
}

const reasonSchema = z.enum(['unauthorised', 'service_error', 'no_answer']);

function readReason(row: Pick<ConnectionRow, 'status_reason'>): FailingReason | null {
  const parsed = reasonSchema.safeParse(row.status_reason);

  return parsed.success ? parsed.data : null;
}
