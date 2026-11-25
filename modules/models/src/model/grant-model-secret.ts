import type { CredentialStore, GrantedSecret } from '@heynixie/credentials';
import type { SandboxAdapter, SecretSpec } from '@heynixie/sandbox';
import type { ResolvedProfile } from '../types';
import type { Harness } from './harness';

export type ModelGrantSecret = Pick<
  SecretSpec,
  'name' | 'host' | 'header' | 'reference' | 'fingerprint'
>;

interface ModelGrantOptions {
  readonly store: CredentialStore;
  readonly sandboxes: Pick<SandboxAdapter, 'addSecret'>;
}

// Puts the profile's model credential into the sandbox broker and returns what the sandbox's grant
// names: the broker's secret name, and for a value nixie holds, its reference and fingerprint. The
// value never leaves the credential store.
export async function grantModelSecret(
  resolved: ResolvedProfile,
  harness: Harness,
  options: ModelGrantOptions,
): Promise<ModelGrantSecret> {
  const baseURL = new URL(resolved.profile.baseURL);

  const request = {
    profileID: resolved.profile.id,
    header: harness.secretHeader,
    host: baseURL.hostname,
  };

  const source =
    resolved.credential === null
      ? { hostHeld: true as const }
      : options.store.register(resolved.credential, {
          kind: 'model',
          label: resolved.profile.id,
          origins: [baseURL.origin],
        });

  const granted: GrantedSecret = await options.store.grant(source, options.sandboxes, request);

  return {
    name: granted.secret,
    host: request.host,
    header: request.header,
    ...(granted.reference === undefined ? {} : { reference: granted.reference }),
    ...(granted.fingerprint === undefined ? {} : { fingerprint: granted.fingerprint }),
  };
}
