import type { AddressCheck } from '@heynixie/egress';
import { makeAddressCheck } from '@heynixie/egress';
import type { SecretSpec } from '@heynixie/sandbox';
import invariant from 'tiny-invariant';
import { createCredentialFetcher } from './fetch/create-credential-fetcher';
import type { Secrets } from './file/load-secrets';
import { readFingerprint } from './fingerprint/read-fingerprint';
import { buildHostHeldName } from './grant/build-host-held-name';
import { modelSecretNameLength, modelSecretPrefix } from './grant/constants';
import { createHeldCredentials } from './held/create-held-credentials';
import type { HeldHandle } from './held/create-held-credentials';
import { CredentialRemovedError } from './held/credential-removed-error';
import type {
  CredentialRecorder,
  HeldBackend,
  HeldState,
  RefreshOutcome,
  TokenExchange,
  TokenResult,
} from './held/types';
import type {
  BindingRef,
  CredentialFetch,
  CredentialRef,
  CredentialSpec,
  DatabaseCredentialRef,
  FetchOptions,
  FileCredentialRef,
  GrantRequest,
  OAuthProvider,
  ResolveCredential,
} from './types';

export interface CredentialStoreOptions {
  readonly secrets: Pick<Secrets, 'readFileValue' | 'fingerprintKey' | 'ownValues'>;
  readonly resolveHost: (host: string) => Promise<readonly string[]>;

  // web fetch's deny list: the deployment's egress denies beside the non-public ranges
  readonly denied: readonly string[];

  // The database backend's storage, and the log the store writes its records to. Without it the
  // store holds file credentials alone.
  readonly held?: {
    readonly backend: HeldBackend;
    readonly recorder: CredentialRecorder;
  };

  // the time a refresh reads, in ms; the system clock by default
  readonly now?: () => number;

  // how long a request to an OAuth provider's token or revoke endpoint may take, in ms; 30 seconds
  // by default
  readonly tokenRequestTimeoutMs?: number;

  // what a test replaces to reach a loopback site
  readonly test?: {
    readonly checkAddress?: AddressCheck;
    readonly ca?: string;
    readonly transport?: (url: string, init: RequestInit) => Promise<Response>;
  };
}

// What a grant tells the caller to put in the sandbox's grant spec.
export interface GrantedSecret {
  readonly secret: string;
  readonly reference?: string;
  readonly fingerprint?: string;
}

interface GrantSandboxes {
  readonly addSecret: (secret: SecretSpec) => Promise<void>;
}

type GrantSource = BindingRef<'file'> | { readonly hostHeld: true };

export interface CredentialStore {
  // A database reference reads its removal counter, so its binding carries the counter's value.
  readonly register: {
    (ref: FileCredentialRef, spec: CredentialSpec): BindingRef<'file'>;
    (ref: DatabaseCredentialRef, spec: CredentialSpec): Promise<BindingRef<'database'>>;
  };

  // null: no credential, the same checks. A database binding takes an OAuth token: the fetcher
  // refreshes it before it expires, and refreshes once and retries once on a 401.
  readonly fetcher: (
    binding: BindingRef | null,
    origins: readonly string[],
    options?: FetchOptions,
  ) => CredentialFetch;

  // A model credential the sandbox host holds has no binding. The broker secret goes in through the
  // sandbox adapter, which records the grant.
  readonly grant: (
    source: GrantSource,
    sandboxes: GrantSandboxes,
    request: GrantRequest,
  ) => Promise<GrantedSecret>;

  // Turns an OAuth client's code into tokens, saved under the credential the request names.
  readonly exchange: (
    client: BindingRef<'database'>,
    request: TokenExchange,
  ) => Promise<TokenResult>;

  // One refresh per credential at a time: a caller that arrives during one waits for its outcome.
  readonly refresh: (binding: BindingRef<'database'>) => Promise<RefreshOutcome>;

  // refreshes when the token expires within 5 minutes or 7 days passed since the last success, and
  // the backoff after a failure has run out; null when it did not send
  readonly refreshIfDue: (binding: BindingRef<'database'>) => Promise<RefreshOutcome | null>;

  // null when the credential holds no token yet
  readonly readStatus: (binding: BindingRef<'database'>) => Promise<HeldState | null>;

  // Removes a database credential and advances its removal counter in one transaction. Every
  // handle made before it refuses from then on, and a refresh in flight saves nothing.
  readonly remove: (ref: DatabaseCredentialRef) => Promise<void>;

  // At start: a refresh that sent and never saved a result marks its credential `needs_consent`.
  readonly recover: () => Promise<void>;
}

// What a part of the server takes to resolve a reference and to fetch or grant with the result.
export interface CredentialAccess {
  readonly resolveCredential: ResolveCredential;
  readonly store: CredentialStore;
}

interface Binding {
  readonly ref: CredentialRef;
  readonly spec: CredentialSpec;
}

const defaultTokenRequestTimeoutMs = 30_000;

export function createCredentialStore(options: CredentialStoreOptions): CredentialStore {
  const bindings = new Map<string, Binding>();
  const ids = new Map<string, string>();

  const checkAddress = options.test?.checkAddress ?? makeAddressCheck(options.denied);
  const now = options.now ?? (() => Date.now());

  const fetcherChecks = {
    resolveHost: options.resolveHost,
    checkAddress,
    ...(options.test?.ca === undefined ? {} : { ca: options.test.ca }),
    ...(options.test?.transport === undefined ? {} : { transport: options.test.transport }),
  };

  const held =
    options.held === undefined
      ? null
      : createHeldCredentials({
          backend: options.held.backend,
          recorder: options.held.recorder,
          fingerprintKey: options.secrets.fingerprintKey,
          ownValues: options.secrets.ownValues,
          now,
          requestTimeoutMs: options.tokenRequestTimeoutMs ?? defaultTokenRequestTimeoutMs,
          makeProviderFetch: (provider, bodyValues) =>
            createCredentialFetcher(fetcherChecks, {
              spec: null,
              readValue: () => null,
              bodyValues,
              origins: normalizeOrigins(listProviderURLs(provider)),
              options: { redirects: 'none' },
            }),
        });

  const requireHeld = () => {
    invariant(
      held !== null,
      'a database credential needs the store to be made with a held backend',
    );

    return held;
  };

  const getBinding = (ref: BindingRef): Binding => {
    const binding = bindings.get(ref.bindingID);

    invariant(binding !== undefined, 'a binding comes from register');

    return binding;
  };

  const toHandle = (ref: BindingRef<'database'>): HeldHandle => {
    const binding = getBinding(ref);

    invariant(binding.ref.backend === 'database', 'a database binding names a database reference');
    invariant(binding.spec.provider !== undefined, 'a database binding names its OAuth provider');

    return {
      credentialID: binding.ref.credentialID,
      removalCounter: ref.removalCounter,
      label: binding.spec.label,
      provider: binding.spec.provider,
    };
  };

  const addBinding = (ref: CredentialRef, spec: CredentialSpec): string => {
    const key = JSON.stringify([ref, spec]);
    const known = ids.get(key);
    const bindingID = known ?? crypto.randomUUID();

    if (known === undefined) {
      const normalized = freezeSpec(spec);

      requireProviderOrigins(normalized);

      ids.set(key, bindingID);
      bindings.set(bindingID, { ref, spec: normalized });
    }

    return bindingID;
  };

  const registerDatabase = async (
    ref: DatabaseCredentialRef,
    spec: CredentialSpec,
  ): Promise<BindingRef<'database'>> => {
    const bindingID = addBinding(ref, spec);

    const removalCounter = await requireHeld().readCounter(ref.credentialID);

    return { bindingID, backend: 'database', removalCounter };
  };

  function register(ref: FileCredentialRef, spec: CredentialSpec): BindingRef<'file'>;

  function register(
    ref: DatabaseCredentialRef,
    spec: CredentialSpec,
  ): Promise<BindingRef<'database'>>;

  // oxlint-disable-next-line zgeoff/no-nested-function-declaration -- overloads need the function keyword
  function register(
    ref: CredentialRef,
    spec: CredentialSpec,
  ): BindingRef<'file'> | Promise<BindingRef<'database'>> {
    if (ref.backend === 'database') {
      return registerDatabase(ref, spec);
    }

    const bindingID = addBinding(ref, spec);

    options.secrets.ownValues.add({
      group: ref.group,
      name: ref.name,
      value: options.secrets.readFileValue(ref),
      isAlways: ref.group === 'settings',
    });

    return { bindingID, backend: 'file', removalCounter: 0 };
  }

  return {
    register,
    fetcher: (ref, origins, fetchOptions = {}) => {
      const binding = ref === null ? null : getBinding(ref);
      const allowed = normalizeOrigins(origins);

      for (const origin of allowed) {
        if (binding !== null && !binding.spec.origins.includes(origin)) {
          throw new Error(`${origin} is not an origin of the credential ${binding.spec.label}`);
        }
      }

      const makeSender = (
        readValue: () => string | null | Promise<string | null>,
        withSendCheck?: <T>(start: () => T) => Promise<T>,
      ) =>
        createCredentialFetcher(fetcherChecks, {
          spec: binding?.spec ?? null,
          readValue,
          origins: allowed,
          options: fetchOptions,
          ...(withSendCheck === undefined ? {} : { withSendCheck }),
        });

      if (ref === null || binding === null) {
        return makeSender(() => null);
      }

      if (binding.ref.backend === 'file') {
        const fileRef = binding.ref;

        return makeSender(() => options.secrets.readFileValue(fileRef));
      }

      const handle = toHandle({ ...ref, backend: 'database' });
      const checkHandle = () => requireHeld().checkCounter(handle);

      const withSendCheck = <T>(start: () => T): Promise<T> =>
        requireHeld().withSendCheck(handle, start);

      const send = makeSender(() => requireHeld().readAccessToken(handle), withSendCheck);
      const sendRefreshed = makeSender(() => requireHeld().readCurrentToken(handle), withSendCheck);

      return async (input, init) => {
        const replayable = await readReplayableInit(init);
        const first = await send(input, replayable);

        await checkHandle();

        if (first.status !== 401) {
          return first;
        }

        const outcome = await requireHeld().refresh(handle);

        if (outcome === 'removed') {
          throw new CredentialRemovedError(binding.spec.label);
        }

        if (outcome !== 'saved') {
          return first;
        }

        const second = await sendRefreshed(input, replayable);

        await checkHandle();

        if (second.status === 401) {
          await requireHeld().markFailing(handle, 'unauthorised');
        }

        return second;
      };
    },
    grant: async (source, sandboxes, request) => {
      if ('hostHeld' in source) {
        const name = buildHostHeldName(request);

        await sandboxes.addSecret({
          name,
          value: null,
          host: request.host,
          header: request.header,
        });

        return { secret: name };
      }

      const binding = getBinding(source);

      invariant(binding.ref.backend === 'file', 'a file binding names a file reference');

      const value = options.secrets.readFileValue(binding.ref);

      const fingerprint = await readFingerprint(value, options.secrets.fingerprintKey);
      const name = await readHeldName(request, value, options.secrets.fingerprintKey);

      const reference = `deployment:${binding.ref.name}`;

      await sandboxes.addSecret({
        name,
        value,
        host: request.host,
        header: request.header,
        reference,
        fingerprint,
      });

      return { secret: name, reference, fingerprint };
    },
    exchange: (client, request) => requireHeld().exchange(toHandle(client), request),
    refresh: (binding) => requireHeld().refresh(toHandle(binding)),
    refreshIfDue: (binding) => requireHeld().refreshIfDue(toHandle(binding)),
    readStatus: (binding) => requireHeld().readState(toHandle(binding)),
    remove: (ref) => requireHeld().remove(ref.credentialID),
    recover: () => requireHeld().recover(),
  };
}

function normalizeOrigins(origins: readonly string[]): readonly string[] {
  return origins.map((origin) => new URL(origin).origin);
}

function listProviderURLs(provider: OAuthProvider): readonly string[] {
  return [provider.tokenURL, ...(provider.revokeURL === undefined ? [] : [provider.revokeURL])];
}

// A handle keeps a copy of the spec, so a caller that changes the object it passed in afterwards
// cannot move the origins the credential may reach.
function freezeSpec(spec: CredentialSpec): CredentialSpec {
  return Object.freeze({
    ...spec,
    origins: Object.freeze(normalizeOrigins(spec.origins)),
    ...(spec.placement === undefined ? {} : { placement: Object.freeze({ ...spec.placement }) }),
    ...(spec.provider === undefined ? {} : { provider: Object.freeze({ ...spec.provider }) }),
  });
}

// A provider's endpoints go through the fetcher, whose origins the credential's spec must name.
function requireProviderOrigins(spec: CredentialSpec): void {
  if (spec.provider === undefined) {
    return;
  }

  for (const origin of normalizeOrigins(listProviderURLs(spec.provider))) {
    if (!spec.origins.includes(origin)) {
      throw new Error(`${origin} is not an origin of the credential ${spec.label}`);
    }
  }
}

// A request body that is a stream is read once, so the retry after a refresh needs the bytes.
async function readReplayableInit(init: RequestInit | undefined): Promise<RequestInit | undefined> {
  if (!(init?.body instanceof ReadableStream)) {
    return init;
  }

  const buffer = await new Response(init.body).arrayBuffer();

  return { ...init, body: new Uint8Array(buffer) };
}

// A value nixie holds goes into a keyed digest, because the broker keeps a granted secret under its
// name and nixie cannot replace its value: a rotation gives a new name.
async function readHeldName(
  request: GrantRequest,
  value: string,
  fingerprintKey: CryptoKey,
): Promise<string> {
  const parts = [request.profileID, request.header, request.host, value].join('\n');

  const signature = await crypto.subtle.sign(
    'HMAC',
    fingerprintKey,
    new TextEncoder().encode(parts),
  );

  const digest = Buffer.from(signature).toString('hex');

  return `${modelSecretPrefix}${digest.slice(0, modelSecretNameLength - modelSecretPrefix.length)}`;
}
