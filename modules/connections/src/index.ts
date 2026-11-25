export type { DatabaseHeldBackend } from './backend/create-database-held-backend';
export { createDatabaseHeldBackend } from './backend/create-database-held-backend';
export { connectionErasableDescriptor } from './erasure/connection-erasable-descriptor';
export type { ConnectionErasureRequest } from './erasure/start-connection-erasure';
export type { ProviderEndpoints } from './provider/google-endpoints';
export { buildProviderEndpoints, googleEndpoints } from './provider/google-endpoints';
export type { ConnectionRecordKind } from './record/connection-record-kind';
export { connectionRecordTopics } from './record/connection-record-topics';
export { revocationRecordedCodec } from './record/revocation-recorded-codec';
export type { Connections, ConnectionsOptions, ConnectionsPort } from './start-connections';
export { startConnections } from './start-connections';

export type {
  BackendHooks,
  ConnectionContext,
  ConnectionMissingScope,
  ConnectionTables,
  FinishConsentInput,
  FinishConsentResult,
  ForgetConnectionResult,
  ForgetState,
  ListedConnection,
  RegisterClientResult,
  RegisteredClient,
  RemoveClientResult,
  SetPickerResult,
  SetupReply,
  StartConsentInput,
  StartConsentResult,
} from './types';
