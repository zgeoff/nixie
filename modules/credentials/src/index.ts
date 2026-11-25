export { deploymentReference } from './deployment-reference';
export { createResolver } from './file/create-resolver';
export type { OwnValueEntry, OwnValueFilter, OwnValueSet } from './own-values/create-own-value-set';
export { createOwnValueSet } from './own-values/create-own-value-set';
export { deriveFingerprintKey } from './fingerprint/derive-fingerprint-key';
export { readFingerprint } from './fingerprint/read-fingerprint';
export type { Secrets, SecretsOptions } from './file/load-secrets';
export { loadSecrets } from './file/load-secrets';
export { MissingCredentialError } from './file/missing-credential-error';
export { readSetting } from './file/read-setting';
export type { SecretsEntryName } from './file/secrets-entry-names';
export { secretsEntryNames } from './file/secrets-entry-names';

export type {
  CredentialQuery,
  CredentialRef,
  FileCredentialRef,
  FileGroup,
  BindingRef,
  CredentialFetch,
  CredentialSpec,
  FetchOptions,
  GrantRequest,
  ResolveCredential,
  SecretsFile,
} from './types';

export { buildHostHeldName } from './grant/build-host-held-name';

export type {
  CredentialAccess,
  CredentialStore,
  CredentialStoreOptions,
  GrantedSecret,
} from './create-credential-store';

export { createCredentialStore } from './create-credential-store';
