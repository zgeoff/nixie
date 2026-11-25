import type { AddressCheck } from '@heynixie/egress';
import { makeAddressCheck } from '@heynixie/egress';
import type { SecretSpec } from '@heynixie/sandbox';
import invariant from 'tiny-invariant';
import { createCredentialFetcher } from './fetch/create-credential-fetcher';
import type { Secrets } from './file/load-secrets';
import { readFingerprint } from './fingerprint/read-fingerprint';
import { buildHostHeldName } from './grant/build-host-held-name';
import { modelSecretNameLength, modelSecretPrefix } from './grant/constants';
import type {
  BindingRef,
  CredentialFetch,
  CredentialRef,
  CredentialSpec,
  FetchOptions,
  GrantRequest,
  ResolveCredential,
} from './types';

export interface CredentialStoreOptions {
  readonly secrets: Pick<Secrets, 'readFileValue' | 'fingerprintKey' | 'ownValues'>;
  readonly resolveHost: (host: string) => Promise<readonly string[]>;

  // web fetch's deny list: the deployment's egress denies beside the non-public ranges
  readonly denied: readonly string[];

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

type GrantSource = BindingRef | { readonly hostHeld: true };

export interface CredentialStore {
  readonly register: (ref: CredentialRef, spec: CredentialSpec) => BindingRef;

  // null: no credential, the same checks
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

export function createCredentialStore(options: CredentialStoreOptions): CredentialStore {
  const bindings = new Map<string, Binding>();
  const ids = new Map<string, string>();

  const checkAddress = options.test?.checkAddress ?? makeAddressCheck(options.denied);

  const getBinding = (ref: BindingRef): Binding => {
    const binding = bindings.get(ref.bindingID);

    invariant(binding !== undefined, 'a binding comes from register');

    return binding;
  };

  return {
    register: (ref, spec) => {
      const key = JSON.stringify([ref, spec]);
      const known = ids.get(key);
      const bindingID = known ?? crypto.randomUUID();

      if (known === undefined) {
        ids.set(key, bindingID);

        bindings.set(bindingID, {
          ref,
          spec: { ...spec, origins: normalizeOrigins(spec.origins) },
        });
      }

      options.secrets.ownValues.add({
        group: ref.group,
        name: ref.name,
        value: options.secrets.readFileValue(ref),
        isAlways: ref.group === 'settings',
      });

      return { bindingID, backend: ref.backend };
    },
    fetcher: (ref, origins, fetchOptions = {}) => {
      const binding = ref === null ? null : getBinding(ref);
      const allowed = normalizeOrigins(origins);

      for (const origin of allowed) {
        if (binding !== null && !binding.spec.origins.includes(origin)) {
          throw new Error(`${origin} is not an origin of the credential ${binding.spec.label}`);
        }
      }

      return createCredentialFetcher(
        {
          resolveHost: options.resolveHost,
          checkAddress,
          ...(options.test?.ca === undefined ? {} : { ca: options.test.ca }),
          ...(options.test?.transport === undefined ? {} : { transport: options.test.transport }),
        },
        {
          spec: binding?.spec ?? null,
          readValue: () => (binding === null ? null : options.secrets.readFileValue(binding.ref)),
          origins: allowed,
          options: fetchOptions,
        },
      );
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
  };
}

function normalizeOrigins(origins: readonly string[]): readonly string[] {
  return origins.map((origin) => new URL(origin).origin);
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
