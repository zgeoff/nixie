import type {
  CredentialEvent,
  HeldToken,
  TokenGuard,
  WriteTokenResult,
} from '@heynixie/credentials';
import { buildCredentialRecordInput } from '@heynixie/credentials';
import { createShortID } from '@heynixie/db';
import type { RecordKey, WriteTransaction } from '@heynixie/log';
import { readRecordKeys, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { ConnectionRow, ConnectionTables } from '../types';
import type { BackendContext } from './backend-context';
import { mintKey, removeKey } from './mint-key';
import { readConnectionRow } from './read-connection-token';
import { sealValue } from './seal-value';

interface TokenWrite {
  readonly credentialID: string;
  readonly token: HeldToken;
  readonly guard: TokenGuard;
  readonly record: CredentialEvent | null;
}

// Saves a token, its state and the record the save owes in one transaction, only while the removal
// counters of the credential and of its client still equal the ones the caller read. A crash at any
// point leaves one whole token in the row, and a mark for each key that may be left over.
export async function writeToken(
  context: BackendContext,
  write: TokenWrite,
): Promise<WriteTokenResult> {
  if (NIXIE_TEST_BUILD) {
    await context.hooks?.beforeTokenWrite?.(write.credentialID);
  }

  const existing = await readConnectionRow(context, write.credentialID);
  const sealed = await sealToken(context, write.token, existing);

  const outcome = await withWriteTransaction(context.log.writer, (tx) =>
    writeInTransaction(tx, context, { ...write, sealed }),
  );

  if (outcome === 'removed') {
    if (sealed.account.isMinted) {
      await removeKey(context, sealed.account.keyID);
    }

    return 'removed';
  }

  context.heldKeys.delete(write.token.keyID);
  context.heldKeys.delete(sealed.account.keyID);

  context.accessTokens.set(`${write.credentialID}:${String(write.guard.expectedCounter)}`, {
    accessToken: write.token.accessToken,
    expiresAtMs: write.token.expiresAtMs,
  });

  if (NIXIE_TEST_BUILD) {
    await context.hooks?.afterTokenSaved?.(write.credentialID);
  }

  return 'saved';
}

interface SealedAccount {
  readonly keyID: string;
  readonly sealed: Uint8Array<ArrayBuffer> | null;

  // whether this save made the key, for a connection that has no row yet
  readonly isMinted: boolean;
}

interface SealedToken {
  readonly refreshSealed: Uint8Array<ArrayBuffer> | null;
  readonly account: SealedAccount;
}

async function sealToken(
  context: BackendContext,
  token: HeldToken,
  existing: ConnectionRow | null,
): Promise<SealedToken> {
  const keys = await readRecordKeys(context.log, [token.keyID]);

  const tokenKey = keys.get(token.keyID);

  invariant(tokenKey, 'a token is sealed under a key that the backend made');

  const refreshSealed =
    token.refreshToken === null
      ? null
      : await sealValue(
          tokenKey,
          { keyID: token.keyID, table: 'connections', column: 'refresh_token_sealed' },
          token.refreshToken,
        );

  return { refreshSealed, account: await sealAccount(context, token, existing) };
}

async function sealAccount(
  context: BackendContext,
  token: HeldToken,
  existing: ConnectionRow | null,
): Promise<SealedAccount> {
  const minted: RecordKey | null = existing === null ? await mintKey(context) : null;
  const keyID = existing?.key_id ?? minted?.keyID;

  invariant(keyID !== undefined, 'a connection has an account key');

  if (token.accountSubject === null) {
    return { keyID, sealed: null, isMinted: minted !== null };
  }

  const stored = await readRecordKeys(context.log, [keyID]);

  const key = minted?.key ?? stored.get(keyID);

  invariant(key, 'an account is sealed under a key that the backend made');

  const sealed = await sealValue(
    key,
    { keyID, table: 'connections', column: 'account_sealed' },
    JSON.stringify({ sub: token.accountSubject }),
  );

  return { keyID, sealed, isMinted: minted !== null };
}

interface SealedTokenWrite extends TokenWrite {
  readonly sealed: SealedToken;
}

async function writeInTransaction(
  tx: WriteTransaction,
  context: BackendContext,
  write: SealedTokenWrite,
): Promise<WriteTokenResult> {
  const tables = tx.$extendTables<ConnectionTables>();

  const current = await tables
    .selectFrom('connections')
    .select(['removal_counter', 'token_key_id', 'binding'])
    .where('connection_id', '=', write.credentialID)
    .executeTakeFirst();

  const client = await tables
    .selectFrom('oauth_clients')
    .select('removal_counter')
    .where('oauth_client_id', '=', write.guard.client.credentialID)
    .executeTakeFirst();

  const isCurrent =
    (current?.removal_counter ?? 0) === write.guard.expectedCounter &&
    (client?.removal_counter ?? 0) === write.guard.client.expectedCounter &&
    (current === undefined || current.binding === 'enabled');

  if (!isCurrent) {
    return 'removed';
  }

  const token = write.token;

  const columns = {
    oauth_client_id: token.clientCredentialID,
    key_id: write.sealed.account.keyID,
    account_sealed: write.sealed.account.sealed,
    token_key_id: token.keyID,
    refresh_token_sealed: write.sealed.refreshSealed,
    status: token.state.status,
    status_reason: token.state.reason ?? null,
    status_since: token.state.sinceMs,
    last_success_at: token.state.lastSuccessAtMs,
    failures: token.state.failures,
    retry_at: token.state.retryAtMs,
  };

  if (current === undefined) {
    await tables
      .insertInto('connections')
      .values({
        connection_id: write.credentialID,
        short_id: createShortID(),
        ...columns,
        created_at: context.now(),
      })
      .execute();
  } else {
    await tables
      .updateTable('connections')
      .set(columns)
      .where('connection_id', '=', write.credentialID)
      .execute();
  }

  await tables
    .deleteFrom('key_marks')
    .where('key_id', 'in', [token.keyID, write.sealed.account.keyID])
    .execute();

  const replacedKeyID = current?.token_key_id ?? null;

  if (replacedKeyID !== null && replacedKeyID !== token.keyID) {
    await tables
      .insertInto('key_marks')
      .values({ key_id: replacedKeyID, marked_at: context.now() })
      .onConflict((conflict) => conflict.doNothing())
      .execute();
  }

  if (write.record !== null) {
    const input = buildCredentialRecordInput(write.record);

    await writeRecordsInTransaction(tx, context.log, [
      { kind: input.kind, payload: input.payload, definitions: context.definitions() },
    ]);
  }

  return 'saved';
}
