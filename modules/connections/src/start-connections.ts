import type { Connector } from '@heynixie/connectors';
import { createGoogleConnector } from '@heynixie/connectors';
import type { CredentialStore } from '@heynixie/credentials';
import type { Definitions, ErasureHandle, ErasureRegistry, Log } from '@heynixie/log';
import type { DatabaseHeldBackend } from './backend/create-database-held-backend';
import { registerClient } from './client/register-client';
import type { RegisterClientInput } from './client/register-client';
import { removeClient } from './client/remove-client';
import { setPicker } from './client/set-picker';
import type { PickerSettings } from './client/set-picker';
import { forgetConnection, readConnectionForgetState } from './connection/forget-connection';
import { listConnections } from './connection/list-connections';
import { readConnectionContext } from './connection/read-connection-context';
import { readHeldBackTools } from './connection/read-held-back-tools';
import { readSetup } from './connection/read-setup';
import { runConnectionCheck, runDailyChecks } from './connection/run-connection-check';
import { finishConsent } from './consent/finish-consent';
import { startConsent } from './consent/start-consent';
import { sweepConsents } from './consent/sweep-consents';
import { buildConnectionErasable } from './erasure/build-connection-erasable';
import { connectionErasableDescriptor } from './erasure/connection-erasable-descriptor';
import type { ConnectionErasureRequest } from './erasure/start-connection-erasure';
import { makeSerialLock } from './make-serial-lock';
import type { ProviderEndpoints } from './provider/google-endpoints';
import { buildProviderEndpoints, googleEndpoints } from './provider/google-endpoints';
import { writeLostRevocations } from './revocation/write-lost-revocations';
import type { ServiceContext } from './service-context';
import type {
  ConnectionContext,
  FinishConsentInput,
  FinishConsentResult,
  ForgetConnectionResult,
  ForgetState,
  ListedConnection,
  RegisterClientResult,
  RemoveClientResult,
  SetPickerResult,
  SetupReply,
  StartConsentInput,
  StartConsentResult,
} from './types';

export interface ConnectionsOptions {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly store: CredentialStore;
  readonly backend: DatabaseHeldBackend;
  readonly erasure: ErasureRegistry;
  readonly now: () => number;

  // Google's connector; a test points its hosts at a fake provider
  readonly connector?: Connector;

  // Google's endpoints, when they differ from the connector's own
  readonly endpoints?: ProviderEndpoints;

  // how long a consent request lives, in ms; 10 minutes by default
  readonly consentLifetimeMs?: number;

  // how long a consent waits for the Forget of its account, and how often it looks, in ms
  readonly forgetWaitMs?: number;
  readonly forgetPollMs?: number;
}

// The API's way into the connections: what a signed-in owner can ask of them.
export interface ConnectionsPort {
  readonly readSetup: (pageOrigin: string) => Promise<SetupReply>;
  readonly registerClient: (input: RegisterClientInput) => Promise<RegisterClientResult>;
  readonly setPicker: (client: string, picker: PickerSettings | null) => Promise<SetPickerResult>;
  readonly removeClient: (client: string) => Promise<RemoveClientResult>;
  readonly startConsent: (input: StartConsentInput) => Promise<StartConsentResult>;
  readonly finishConsent: (input: FinishConsentInput) => Promise<FinishConsentResult>;
  readonly list: () => Promise<ListedConnection[]>;

  // Forgets a connection by its short ID, and runs the forget to its end.
  readonly forgetConnection: (connection: string) => Promise<ForgetConnectionResult>;

  // null for a short ID that no connection holds
  readonly readForgetState: (
    connection: string,
  ) => Promise<{ readonly connection: string; readonly state: ForgetState } | null>;
}

export interface Connections extends ConnectionsPort {
  // begins a forget and runs it to its end
  readonly forget: ErasureHandle<ConnectionErasureRequest>;

  // At start, before the runner's catch-up: gives each forget with no revocation outcome the outcome
  // `unknown`, so the catch-up never sends a second revocation.
  readonly writeLostRevocations: () => Promise<number>;

  // what a Google tool, attempt or check gets for one connection; null when it is not live
  readonly readContext: (connectionID: string) => Promise<ConnectionContext | null>;

  // reads each scope of a live connection again and keeps what it found
  readonly runCheck: (connectionID: string) => Promise<'checked' | 'failed' | 'skipped'>;

  // the daily check of every live connection; returns how many it checked
  readonly runDailyChecks: () => Promise<number>;

  // The names of the tools that a run leaves out of its list, because no live connection has all the
  // scopes they need.
  readonly readHeldBackTools: () => Promise<readonly string[]>;

  // deletes lapsed consent requests and abandoned consent credentials
  readonly sweepConsents: () => Promise<{
    readonly requests: number;
    readonly credentials: number;
  }>;
}

const defaultConsentLifetimeMs = 10 * 60 * 1000;
const defaultForgetWaitMs = 30_000;
const defaultForgetPollMs = 250;

// Registers the connection's erasable with the runner, and returns what the server runs at start
// and what the API calls.
export function startConnections(options: ConnectionsOptions): Connections {
  const writer = { log: options.log, definitions: options.definitions };
  const connector = options.connector ?? createGoogleConnector();

  const endpoints =
    options.endpoints ??
    (connector.auth.kind === 'oauth' ? buildProviderEndpoints(connector.auth) : googleEndpoints);

  const forget = options.erasure.register({
    ...connectionErasableDescriptor,
    ...buildConnectionErasable({
      ...writer,
      store: options.store,
      backend: options.backend,
      endpoints,
      attempted: new Set(),
      now: options.now,
    }),
  });

  if (connector.auth.kind !== 'oauth') {
    throw new Error('the connections module needs a connector that signs in with OAuth');
  }

  const context: ServiceContext = {
    ...writer,
    store: options.store,
    backend: options.backend,
    connector,
    spec: connector.auth,
    endpoints,
    forget,
    now: options.now,
    lock: makeSerialLock(),
    consentLifetimeMs: options.consentLifetimeMs ?? defaultConsentLifetimeMs,
    forgetWaitMs: options.forgetWaitMs ?? defaultForgetWaitMs,
    forgetPollMs: options.forgetPollMs ?? defaultForgetPollMs,
  };

  return {
    forget,
    writeLostRevocations: () => writeLostRevocations(writer),
    readSetup: (pageOrigin) => readSetup(context, pageOrigin),
    registerClient: (input) => registerClient(context, input),
    setPicker: (client, picker) => setPicker(context, client, picker),
    removeClient: (client) => removeClient(context, client),
    startConsent: (input) => startConsent(context, input),
    finishConsent: (input) => finishConsent(context, input),
    list: () => listConnections(context),
    forgetConnection: (connection) => forgetConnection(context, connection),
    readForgetState: (connection) => readConnectionForgetState(context, connection),
    readContext: (connectionID) => readConnectionContext(context, connectionID),
    runCheck: (connectionID) => runConnectionCheck(context, connectionID),
    runDailyChecks: () => runDailyChecks(context),
    readHeldBackTools: () => readHeldBackTools(context),
    sweepConsents: () => sweepConsents(context),
  };
}
