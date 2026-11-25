import type { Connector, OAuthSpec } from '@heynixie/connectors';
import type { CredentialStore } from '@heynixie/credentials';
import type { Definitions, ErasureHandle, Log } from '@heynixie/log';
import type { DatabaseHeldBackend } from './backend/create-database-held-backend';
import type { ConnectionErasureRequest } from './erasure/start-connection-erasure';
import type { SerialLock } from './make-serial-lock';
import type { ProviderEndpoints } from './provider/google-endpoints';

// What the client, consent and connection operations share.
export interface ServiceContext {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly store: CredentialStore;
  readonly backend: DatabaseHeldBackend;
  readonly connector: Connector;
  readonly spec: OAuthSpec;
  readonly endpoints: ProviderEndpoints;
  readonly forget: ErasureHandle<ConnectionErasureRequest>;
  readonly now: () => number;
  readonly lock: SerialLock;
  readonly consentLifetimeMs: number;

  // how long a consent waits for the Forget of its account, and how often it looks
  readonly forgetWaitMs: number;
  readonly forgetPollMs: number;
}
