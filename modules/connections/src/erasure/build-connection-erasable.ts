import type { CredentialStore } from '@heynixie/credentials';
import type { Erasable } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { RevocationDependencies } from '../revocation/revoke-connection';
import { revokeConnection } from '../revocation/revoke-connection';
import type { ConnectionTables } from '../types';
import type { ConnectionErasureRequest, ReadConnectionWakes } from './start-connection-erasure';
import { startConnectionErasure } from './start-connection-erasure';

export interface ConnectionErasableOptions extends RevocationDependencies {
  readonly store: Pick<CredentialStore, 'register' | 'revoke' | 'remove'>;
  readonly now: () => number;
  readonly eraseDependents: (connectionID: string) => Promise<void>;

  // the wakes that show mail of the connection
  readonly readWakes: ReadConnectionWakes;
}

// The connection's runner methods. A forget stops every request in flight on the connection, sends
// one revocation and records its outcome, and only then lets the runner delete the keys. A connection
// keeps its row, with its short ID and no sealed value.
export function buildConnectionErasable(
  options: ConnectionErasableOptions,
): Erasable<ConnectionErasureRequest> {
  return {
    start: (tx, request) =>
      startConnectionErasure(tx, request, { nowMs: options.now(), readWakes: options.readWakes }),
    hide: async (target) => {
      await options.store.remove({ backend: 'database', credentialID: target.targetID });
      await options.eraseDependents(target.targetID);
    },
    revoke: (target) => revokeConnection(options, target.targetID),
    readChildren: () => Promise.resolve([]),
    toRequest: (target) => ({ connection: target.targetID }),
    cleanIndexes: async (target) => {
      await options.eraseDependents(target.targetID);

      await withWriteTransaction(options.log.writer, async (tx) => {
        await tx
          .$extendTables<ConnectionTables>()
          .updateTable('connections')
          .set({
            account_sealed: null,
            label_sealed: null,
            refresh_token_sealed: null,
            token_key_id: null,
            binding: 'removed',
          })
          .where('connection_id', '=', target.targetID)
          .execute();
      });
    },
  };
}
