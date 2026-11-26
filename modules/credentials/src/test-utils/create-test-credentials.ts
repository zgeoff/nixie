import { createCredentialStore } from '../create-credential-store';
import type { CredentialStore } from '../create-credential-store';
import { createResolver } from '../file/create-resolver';
import { deriveFingerprintKey } from '../fingerprint/derive-fingerprint-key';
import { createOwnValueSet } from '../own-values/create-own-value-set';
import type { OwnValueSet } from '../own-values/create-own-value-set';
import type { FileCredentialRef, ResolveCredential, SecretsFile } from '../types';

export interface TestCredentials {
  readonly resolveCredential: ResolveCredential;
  readonly store: CredentialStore;
  readonly ownValues: OwnValueSet;
}

export interface TestCredentialGroups {
  readonly model_credentials?: Readonly<Record<string, string>>;
  readonly connector_credentials?: Readonly<Record<string, string>>;
  readonly settings?: Readonly<Record<string, string>>;
}

export interface TestCredentialSite {
  // the certificate authority that a loopback site signs with; every host then resolves to the
  // loopback address, and the store sends there
  readonly ca: string;
}

// A real resolver and store over the groups a test names. Without a site, the store's resolver
// finds no host.
export async function createTestCredentials(
  groups: TestCredentialGroups = {},
  site?: TestCredentialSite,
): Promise<TestCredentials> {
  const file: SecretsFile = {
    deployment_key: Buffer.alloc(32, 5).toString('base64'),
    model_credentials: groups.model_credentials ?? {},
    connector_credentials: groups.connector_credentials ?? {},
    settings: groups.settings ?? {},
  };

  const ownValues = createOwnValueSet();
  const hosts = site === undefined ? [] : ['127.0.0.1'];

  const store = createCredentialStore({
    secrets: {
      readFileValue: (ref: FileCredentialRef) => file[ref.group][ref.name] ?? '',
      fingerprintKey: await deriveFingerprintKey(Buffer.alloc(32, 5)),
      ownValues,
    },
    resolveHost: () => Promise.resolve(hosts),
    denied: [],
    ...(site === undefined ? {} : { test: { checkAddress: () => true, ca: site.ca } }),
  });

  return { resolveCredential: createResolver(file), store, ownValues };
}
