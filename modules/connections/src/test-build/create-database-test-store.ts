import type { CredentialRecorder, CredentialStore, OwnValueSet } from '@heynixie/credentials';
import {
  createCredentialRecorder,
  createCredentialStore,
  createOwnValueSet,
  deriveFingerprintKey,
} from '@heynixie/credentials';
import type { Log } from '@heynixie/log';
import type { DatabaseHeldBackend } from '../backend/create-database-held-backend';
import { createDatabaseHeldBackend } from '../backend/create-database-held-backend';
import type { BackendHooks } from '../types';

export interface DatabaseTestStoreOptions {
  readonly log: Log;

  // the certificate authority that signs the fake provider's site
  readonly ca: string;
  readonly now: () => number;

  // the lookup of a host name; every name goes to the loopback address by default
  readonly resolveHost?: (host: string) => Promise<readonly string[]>;
  readonly tokenRequestTimeoutMs?: number;
  readonly hooks?: BackendHooks;
}

export interface DatabaseTestStore {
  readonly store: CredentialStore;
  readonly backend: DatabaseHeldBackend;
  readonly recorder: CredentialRecorder;
  readonly ownValues: OwnValueSet;
}

// A credential store over the database backend and a real log. Every request goes over the pinned
// connection to a loopback HTTPS site that signs with `ca`.
export async function createDatabaseTestStore(
  options: DatabaseTestStoreOptions,
): Promise<DatabaseTestStore> {
  const recorder = createCredentialRecorder({ log: options.log, definitions: readTestDefinitions });

  const backend = createDatabaseHeldBackend({
    log: options.log,
    definitions: readTestDefinitions,
    recorder,
    now: options.now,
    ...(options.hooks === undefined ? {} : { hooks: options.hooks }),
  });

  const ownValues = createOwnValueSet();

  const store = createCredentialStore({
    secrets: {
      readFileValue: () => '',
      fingerprintKey: await deriveFingerprintKey(Buffer.alloc(32, 7)),
      ownValues,
    },
    resolveHost: options.resolveHost ?? (() => Promise.resolve(['127.0.0.1'])),
    denied: [],
    held: () => ({ backend, recorder }),
    now: options.now,
    ...(options.tokenRequestTimeoutMs === undefined
      ? {}
      : { tokenRequestTimeoutMs: options.tokenRequestTimeoutMs }),
    test: { checkAddress: (address) => address === '127.0.0.1', ca: options.ca },
  });

  return { store, backend, recorder, ownValues };
}

function readTestDefinitions() {
  return { snapshotHash: 'test-snapshot' };
}
