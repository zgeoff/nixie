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
import { readConnectionStates } from './connection/read-connection-states';
import { readHeldBackTools } from './connection/read-held-back-tools';
import { readLiveContexts } from './connection/read-live-contexts';
import { readSetup } from './connection/read-setup';
import { runConnectionCheck, runDailyChecks } from './connection/run-connection-check';
import type { Connector } from './connector/types';
import { finishConsent } from './consent/finish-consent';
import { startConsent } from './consent/start-consent';
import { sweepConsents } from './consent/sweep-consents';
import { buildConnectionErasable } from './erasure/build-connection-erasable';
import { connectionErasableDescriptor } from './erasure/connection-erasable-descriptor';
import type {
  ConnectionErasureRequest,
  ReadConnectionWakes,
} from './erasure/start-connection-erasure';
import { makeSerialLock } from './make-serial-lock';
import type { ProviderEndpoints } from './provider/provider-endpoints';
import { buildProviderEndpoints } from './provider/provider-endpoints';
import { writeLostRevocations } from './revocation/write-lost-revocations';
import type { ServiceContext } from './service-context';
import type {
  ConnectionContext,
  ConnectionState,
  FinishConsentInput,
  FinishConsentResult,
  ForgetConnectionResult,
  ForgetState,
  ListedConnection,
  OperationAttempt,
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

  // the provider's connector, which signs in with OAuth
  readonly connector: Connector;

  // the provider's endpoints, when they differ from the connector's own
  readonly endpoints?: ProviderEndpoints;

  // Erases what other modules keep of a connection, such as its wake rules and the text of its
  // wakes. A forget calls it twice, once right after it begins and once after the keys go, so it
  // must be safe to repeat.
  readonly eraseDependents?: (connectionID: string) => Promise<void>;

  // The wakes that show mail of a connection, read in the transaction that begins its forget, so
  // the forget cleans the sessions and the turn inputs that hold their text.
  readonly readWakes?: ReadConnectionWakes;

  // how long a consent request lives, in ms; 10 minutes by default
  readonly consentLifetimeMs?: number;

  // how long a consent waits for the Forget of its account, and how often it looks, in ms
  readonly forgetWaitMs?: number;
  readonly forgetPollMs?: number;
}

// The API's way into the connections: what a signed-in owner can ask of them.
export interface ConnectionsPort {
  readonly readSetup: (pageOrigin: string) => Promise<SetupReply>;
  readonly registerClient: (
    input: RegisterClientInput,
    attempt?: OperationAttempt<RegisterClientResult>,
  ) => Promise<RegisterClientResult>;
  readonly setPicker: (
    client: string,
    picker: PickerSettings | null,
    attempt?: OperationAttempt<SetPickerResult>,
  ) => Promise<SetPickerResult>;
  readonly removeClient: (
    client: string,
    attempt?: OperationAttempt<RemoveClientResult>,
  ) => Promise<RemoveClientResult>;
  readonly startConsent: (
    input: StartConsentInput,
    attempt?: OperationAttempt<StartConsentResult>,
  ) => Promise<StartConsentResult>;
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

  // what a connector's tool, attempt or check gets for one connection; null when it is not live
  readonly readContext: (connectionID: string) => Promise<ConnectionContext | null>;

  // the context of each live connection, or of the one that the short ID names
  readonly readLiveContexts: (connection?: string) => Promise<ConnectionContext[]>;

  // each connection that is not forgotten, with its status and granted scopes
  readonly readStates: () => Promise<ConnectionState[]>;

  // the tools that the connector holds
  readonly actions: Connector['actions'];

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
  const connector = options.connector;

  if (connector.auth.kind !== 'oauth') {
    throw new Error('the connections module needs a connector that signs in with OAuth');
  }

  const endpoints = options.endpoints ?? buildProviderEndpoints(connector.auth);

  const forget = options.erasure.register({
    ...connectionErasableDescriptor,
    ...buildConnectionErasable({
      ...writer,
      store: options.store,
      backend: options.backend,
      endpoints,
      attempted: new Set(),
      now: options.now,
      eraseDependents: options.eraseDependents ?? (() => Promise.resolve()),
      readWakes: options.readWakes ?? (() => Promise.resolve([])),
    }),
  });

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
    registerClient: (input, attempt) => registerClient(context, input, attempt),
    setPicker: (client, picker, attempt) => setPicker(context, client, picker, attempt),
    removeClient: (client, attempt) => removeClient(context, client, attempt),
    startConsent: (input, attempt) => startConsent(context, input, attempt),
    finishConsent: (input) => finishConsent(context, input),
    list: () => listConnections(context),
    forgetConnection: (connection) => forgetConnection(context, connection),
    readForgetState: (connection) => readConnectionForgetState(context, connection),
    readContext: (connectionID) => readConnectionContext(context, connectionID),
    runCheck: (connectionID) => runConnectionCheck(context, connectionID),
    runDailyChecks: () => runDailyChecks(context),
    readHeldBackTools: () => readHeldBackTools(context),
    readStates: () => readConnectionStates(context),
    readLiveContexts: (connection) => readLiveContexts(context, connection ?? null),
    actions: connector.actions,
    sweepConsents: () => sweepConsents(context),
  };
}
