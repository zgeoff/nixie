import type { WriteTransaction } from '@heynixie/log';
import type { ConnectionTables } from '../types';

export interface AddressVersion {
  readonly addressRef: string;
  readonly connectionID: string;

  // sealed under the connection's key, as its account column is
  readonly accountSealed: Uint8Array<ArrayBuffer>;
  readonly createdAt: number;
}

// Keeps one address of a connection's account under its reference. A reference that a row already
// holds keeps its first address.
export async function writeAddressVersion(
  tx: WriteTransaction,
  version: AddressVersion,
): Promise<void> {
  await tx
    .$extendTables<ConnectionTables>()
    .insertInto('connection_addresses')
    .values({
      address_ref: version.addressRef,
      connection_id: version.connectionID,
      account_sealed: version.accountSealed,
      created_at: version.createdAt,
    })
    .onConflict((conflict) => conflict.doNothing())
    .execute();
}
