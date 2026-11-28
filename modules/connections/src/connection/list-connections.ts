import { z } from 'zod';
import { readRevocationOutcomes } from '../revocation/read-revocation-outcomes';
import type { ServiceContext } from '../service-context';
import type { ConnectionMissingScope, ConnectionRow, ListedConnection } from '../types';
import { openConnectionValues } from './open-connection-values';
import { pickConnectionStatus } from './pick-connection-status';
import { readConnectionRows } from './read-connection-rows';
import { readForgetState } from './read-forget-state';

const scopesSchema = z.array(z.string());

const missingSchema = z.array(
  z.object({ scope: z.string(), reason: z.enum(['not_granted', 'api_disabled']) }),
);

// Each connection in the order it was made, with the status the owner sees. A forgotten connection
// lists with no label and no account, and the state of its forget.
export async function listConnections(context: ServiceContext): Promise<ListedConnection[]> {
  const rows = await readConnectionRows(context.log);

  const opened = await openConnectionValues(
    context.log,
    rows.filter((row) => row.binding === 'enabled'),
  );

  const outcomes = await readRevocationOutcomes(context.log);

  return Promise.all(
    rows.map(async (row) => {
      const status = pickConnectionStatus({
        binding: row.binding,
        status: row.status,
        refreshExpiresAtMs: row.refresh_expires_at,
        nowMs: context.now(),
      });

      const values = opened.get(row.connection_id);

      return {
        connection: row.short_id,
        connector: row.connector_id,
        label: values?.label ?? null,
        account: values?.account?.email ?? null,
        status,
        reason: status === 'failing' ? readReason(row) : null,
        statusSince: row.status_since,
        lastSuccessAt: row.last_success_at,
        scopes: readGranted(row),
        missing: readMissing(row),
        fingerprint: row.token_fingerprint,
        forget:
          row.binding === 'enabled'
            ? null
            : await readForgetState(context.log, row.connection_id, outcomes),
      };
    }),
  );
}

const reasonSchema = z.enum(['unauthorised', 'service_error', 'no_answer']);

function readReason(row: ConnectionRow): ListedConnection['reason'] {
  const parsed = reasonSchema.safeParse(row.status_reason);

  return parsed.success ? parsed.data : null;
}

export function readGranted(row: Pick<ConnectionRow, 'granted_scopes'>): string[] {
  return scopesSchema.parse(JSON.parse(row.granted_scopes));
}

export function readMissing(row: Pick<ConnectionRow, 'missing_scopes'>): ConnectionMissingScope[] {
  return missingSchema.parse(JSON.parse(row.missing_scopes));
}
