import type { HeldState, HeldToken, RevocableToken } from '@heynixie/credentials';
import { readRecordKeys } from '@heynixie/log';
import { z } from 'zod';
import type { ConnectionRow, ConnectionTables } from '../types';
import type { BackendContext } from './backend-context';
import { openValue } from './seal-value';

const accountSchema = z.object({ sub: z.string() });

export async function readConnectionRow(
  context: BackendContext,
  connectionID: string,
): Promise<ConnectionRow | null> {
  const row = await context.log.writer.db
    .$extendTables<ConnectionTables>()
    .selectFrom('connections')
    .selectAll()
    .where('connection_id', '=', connectionID)
    .executeTakeFirst();

  return row ?? null;
}

// The token of a live connection. Null when the connection has no row, was removed, or lost a key,
// such as after a restore of the database from before the key was made.
export async function readConnectionToken(
  context: BackendContext,
  connectionID: string,
): Promise<HeldToken | null> {
  const row = await readConnectionRow(context, connectionID);

  if (row?.binding !== 'enabled' || row.token_key_id === null) {
    return null;
  }

  const state = readState(row);

  const keys = await readRecordKeys(context.log, [row.key_id, row.token_key_id]);

  const refreshToken = await readSealed(
    keys.get(row.token_key_id) ?? null,
    { keyID: row.token_key_id, column: 'refresh_token_sealed' },
    row.refresh_token_sealed,
  );

  const account = await readSealed(
    keys.get(row.key_id) ?? null,
    { keyID: row.key_id, column: 'account_sealed' },
    row.account_sealed,
  );

  if (refreshToken.kind === 'lost' || account.kind === 'lost' || state === null) {
    return null;
  }

  const access = context.accessTokens.get(`${connectionID}:${String(row.removal_counter)}`);

  return {
    accessToken: access?.accessToken ?? '',
    refreshToken: refreshToken.kind === 'value' ? refreshToken.value : null,
    expiresAtMs: access?.expiresAtMs ?? 0,
    keyID: row.token_key_id,
    clientCredentialID: row.oauth_client_id,
    accountSubject:
      account.kind === 'value' ? accountSchema.parse(JSON.parse(account.value)).sub : null,
    state,
  };
}

// The token of a connection whose removal began, which every other read refuses. Null once its key
// is gone.
export async function readRevocableToken(
  context: BackendContext,
  connectionID: string,
): Promise<RevocableToken | null> {
  const row = await readConnectionRow(context, connectionID);

  if (
    row === null ||
    row.binding === 'removed' ||
    row.token_key_id === null ||
    row.refresh_token_sealed === null
  ) {
    return null;
  }

  const keys = await readRecordKeys(context.log, [row.token_key_id]);

  const refreshToken = await readSealed(
    keys.get(row.token_key_id) ?? null,
    { keyID: row.token_key_id, column: 'refresh_token_sealed' },
    row.refresh_token_sealed,
  );

  if (refreshToken.kind !== 'value') {
    return null;
  }

  return {
    refreshToken: refreshToken.value,
    accessToken: '',
    clientCredentialID: row.oauth_client_id,
  };
}

const stateSchema = z.object({
  status: z.enum(['active', 'failing', 'needs_consent']),
  reason: z.enum(['unauthorised', 'service_error', 'no_answer']).nullable(),
});

function readState(row: ConnectionRow): HeldState | null {
  const parsed = stateSchema.safeParse({ status: row.status, reason: row.status_reason });

  if (!parsed.success) {
    return null;
  }

  return {
    status: parsed.data.status,
    ...(parsed.data.reason === null ? {} : { reason: parsed.data.reason }),
    sinceMs: row.status_since,
    lastSuccessAtMs: row.last_success_at,
    failures: row.failures,
    retryAtMs: row.retry_at,
  };
}

interface SealedColumn {
  readonly keyID: string;
  readonly column: string;
}

type SealedRead =
  | { readonly kind: 'none' }
  | { readonly kind: 'lost' }
  | { readonly kind: 'value'; readonly value: string };

// 'lost' when the key is gone or the value fails to open
async function readSealed(
  key: CryptoKey | null,
  column: SealedColumn,
  sealed: Uint8Array<ArrayBuffer> | null,
): Promise<SealedRead> {
  if (sealed === null) {
    return { kind: 'none' };
  }

  if (key === null) {
    return { kind: 'lost' };
  }

  try {
    const value = await openValue(
      key,
      { keyID: column.keyID, table: 'connections', column: column.column },
      sealed,
    );

    return { kind: 'value', value };
  } catch {
    return { kind: 'lost' };
  }
}
