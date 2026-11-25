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
  DatabaseCredentialRef,
  FileCredentialRef,
  OAuthProvider,
  FileGroup,
  BindingRef,
  CredentialFetch,
  CredentialSocket,
  CredentialSocketOpener,
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
  HeldWiring,
} from './create-credential-store';

export { createCredentialStore } from './create-credential-store';
export type { CredentialRecorderOptions } from './record/create-credential-recorder';

export {
  buildCredentialRecordInput,
  createCredentialRecorder,
} from './record/create-credential-recorder';

export { credentialRecordTopics } from './record/credential-record-topics';
export type { CredentialRecordKind } from './record/credential-record-kind';
export { CredentialRemovedError } from './held/credential-removed-error';
export type { TokenRequestErrorCode } from './held/token-request-error';
export { TokenRequestError } from './held/token-request-error';

export type {
  CredentialEvent,
  CredentialRecorder,
  CredentialStatus,
  FailingReason,
  HeldBackend,
  HeldClient,
  HeldState,
  HeldToken,
  OpenRefresh,
  ClientGuard,
  RefreshOutcome,
  RevocableToken,
  TokenGuard,
  RevokeOutcome,
  RevokeResult,
  TokenExchange,
  TokenResult,
  WriteTokenResult,
} from './held/types';
