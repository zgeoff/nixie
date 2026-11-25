import type { Log } from '@heynixie/log';
import { createCredentialStore } from '../create-credential-store';
import type { CredentialStore } from '../create-credential-store';
import { deriveFingerprintKey } from '../fingerprint/derive-fingerprint-key';
import { createOwnValueSet } from '../own-values/create-own-value-set';
import type { OwnValueSet } from '../own-values/create-own-value-set';
import { createCredentialRecorder } from '../record/create-credential-recorder';
import { createInMemoryHeldBackend } from './create-in-memory-held-backend';
import type { InMemoryHeldBackend } from './create-in-memory-held-backend';

export interface HeldTestStoreOptions {
  readonly log: Log;
  readonly ca: string;
  readonly now: () => number;

  // a backend a test keeps across stores; a new one by default
  readonly backend?: InMemoryHeldBackend;
}

export interface HeldTestStore {
  readonly store: CredentialStore;
  readonly backend: InMemoryHeldBackend;
  readonly ownValues: OwnValueSet;
}

// A store with the in-memory held backend and a recorder over a real log. Every request goes over
// the pinned connection to a loopback HTTPS site that signs with `ca`.
export async function createHeldTestStore(options: HeldTestStoreOptions): Promise<HeldTestStore> {
  const backend = options.backend ?? createInMemoryHeldBackend();
  const ownValues = createOwnValueSet();

  const store = createCredentialStore({
    secrets: {
      readFileValue: () => '',
      fingerprintKey: await deriveFingerprintKey(Buffer.alloc(32, 7)),
      ownValues,
    },
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    denied: [],
    held: {
      backend,
      recorder: createCredentialRecorder({
        log: options.log,
        definitions: () => ({ snapshotHash: 'test-snapshot' }),
      }),
    },
    now: options.now,
    test: { checkAddress: (address) => address === '127.0.0.1', ca: options.ca },
  });

  return { store, backend, ownValues };
}
