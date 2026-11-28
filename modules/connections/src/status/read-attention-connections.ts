import { z } from 'zod';
import { readConnectionRows } from '../connection/read-connection-rows';
import type { ServiceContext } from '../service-context';
import type { ConnectionRow } from '../types';
import { collectRemovedToolNames } from './collect-removed-tool-names';
import { pickRowAttention } from './pick-row-attention';
import { pickStatusSince } from './pick-status-since';
import { readConnectionFacts } from './read-connection-facts';
import type { AttentionConnection, FailingReason } from './types';

// Each connection that is `needs_consent`, `disconnected`, `failing` or `expiring`, in the order the
// connections were made. A forgotten connection never lists, and `scope` limits the list to the
// short IDs it holds, as a job run's pins do; null lists every connection.
export async function readAttentionConnections(
  context: ServiceContext,
  scope: ReadonlySet<string> | null,
): Promise<AttentionConnection[]> {
  const rows = await readConnectionRows(context.log);

  const nowMs = context.now();

  const attended = rows.filter(
    (row) =>
      (row.binding === 'enabled' || row.binding === 'disabled') &&
      (scope === null || scope.has(row.short_id)) &&
      pickRowAttention(row, nowMs) !== null,
  );

  const facts = await readConnectionFacts(context, attended);

  return attended.flatMap((row): AttentionConnection[] => {
    const status = pickRowAttention(row, nowMs);
    const found = facts.get(row.connection_id);

    if (status === null || found === undefined) {
      return [];
    }

    return [
      {
        connection: found.connection,
        connector: found.connector,
        label: found.label,
        account: found.account,
        status,
        reason: status === 'failing' ? readReason(row) : null,
        sinceMs: pickStatusSince(row, status),
        lastSuccessAtMs: found.lastSuccessAtMs,
        removedTools: collectRemovedToolNames(status, found.toolNames),
      },
    ];
  });
}

const reasonSchema = z.enum(['unauthorised', 'service_error', 'no_answer']);

function readReason(row: Pick<ConnectionRow, 'status_reason'>): FailingReason | null {
  const parsed = reasonSchema.safeParse(row.status_reason);

  return parsed.success ? parsed.data : null;
}
