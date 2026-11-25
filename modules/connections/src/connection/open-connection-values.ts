import type { Log } from '@heynixie/log';
import { readRecordKeys } from '@heynixie/log';
import { z } from 'zod';
import { openValue, sealValue } from '../backend/seal-value';
import type { ConnectionRow } from '../types';

const accountSchema = z.object({ sub: z.string(), email: z.string().nullish() });

export interface ConnectionAccount {
  readonly subject: string;
  readonly email: string | null;
}

export interface OpenedConnection {
  // null once the key is gone, or while no value is sealed
  readonly account: ConnectionAccount | null;
  readonly label: string | null;
}

// Opens the account and the label of each row under the row's key. A value whose key is gone, such
// as after a forget, reads as null.
export async function openConnectionValues(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  rows: readonly ConnectionRow[],
): Promise<ReadonlyMap<string, OpenedConnection>> {
  const keys = await readRecordKeys(log, [...new Set(rows.map((row) => row.key_id))]);

  const opened = new Map<string, OpenedConnection>();

  for (const row of rows) {
    const key = keys.get(row.key_id) ?? null;

    const [account, label] =
      key === null
        ? [null, null]
        : await Promise.all([
            openText(key, row, 'account_sealed', row.account_sealed),
            openText(key, row, 'label_sealed', row.label_sealed),
          ]);

    const parsed = account === null ? null : accountSchema.safeParse(JSON.parse(account));

    opened.set(row.connection_id, {
      account:
        parsed !== null && parsed.success
          ? { subject: parsed.data.sub, email: parsed.data.email ?? null }
          : null,
      label,
    });
  }

  return opened;
}

export interface ConnectionValues {
  readonly account: ConnectionAccount;
  readonly label: string | null;
}

export interface SealedValues {
  readonly account: Uint8Array<ArrayBuffer>;
  readonly label: Uint8Array<ArrayBuffer> | null;
}

// Seals a connection's account and label under the key that seals its account.
export async function sealConnectionValues(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  row: Pick<ConnectionRow, 'key_id'>,
  values: ConnectionValues,
): Promise<SealedValues | null> {
  const keys = await readRecordKeys(log, [row.key_id]);

  const key = keys.get(row.key_id) ?? null;

  if (key === null) {
    return null;
  }

  const account = await sealValue(
    key,
    { keyID: row.key_id, table: 'connections', column: 'account_sealed' },
    JSON.stringify({ sub: values.account.subject, email: values.account.email }),
  );

  const label =
    values.label === null
      ? null
      : await sealValue(
          key,
          { keyID: row.key_id, table: 'connections', column: 'label_sealed' },
          values.label,
        );

  return { account, label };
}

async function openText(
  key: CryptoKey,
  row: ConnectionRow,
  column: 'account_sealed' | 'label_sealed',
  sealed: Uint8Array<ArrayBuffer> | null,
): Promise<string | null> {
  if (sealed === null) {
    return null;
  }

  try {
    return await openValue(key, { keyID: row.key_id, table: 'connections', column }, sealed);
  } catch {
    return null;
  }
}
