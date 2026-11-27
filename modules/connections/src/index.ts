export type { DatabaseHeldBackend } from './backend/create-database-held-backend';
export { createDatabaseHeldBackend } from './backend/create-database-held-backend';
export { connectionErasableDescriptor } from './erasure/connection-erasable-descriptor';
export type { ConnectionErasureRequest } from './erasure/start-connection-erasure';
export type { ProviderEndpoints } from './provider/provider-endpoints';
export { buildProviderEndpoints } from './provider/provider-endpoints';
export type { ConnectionRecordKind } from './record/connection-record-kind';
export { connectionRecordTopics } from './record/connection-record-topics';
export { revocationRecordedCodec } from './record/revocation-recorded-codec';
export type { Connections, ConnectionsOptions, ConnectionsPort } from './start-connections';
export { startConnections } from './start-connections';
export { probeConnectionEnabled } from './connection/probe-connection-enabled';

export type {
  BackendHooks,
  ConnectionContext,
  ConnectionState,
  ConnectionMissingScope,
  ConnectionTables,
  FinishConsentInput,
  FinishConsentResult,
  ForgetConnectionResult,
  ForgetState,
  ListedConnection,
  OperationAttempt,
  RegisterClientResult,
  RegisteredClient,
  RemoveClientResult,
  SetPickerResult,
  SetupReply,
  StartConsentInput,
  StartConsentResult,
} from './types';

export type {
  ActionAttempt,
  ActionConnector,
  CheckResponse,
  Connector,
  ConnectorAction,
  ConnectorContext,
  ConnectorLookup,
  ConnectionRef,
  HealthReport,
  MissingScope,
  OAuthSpec,
  ProviderFetch,
  ProviderResponse,
  Reconcile,
  SetupLink,
  SetupStep,
} from './connector/types';

export { defaultTrustNegativeAfterMs } from './connector/types';
export type { SetupPlaceholders } from './connector/fill-setup-steps';
export { fillSetupSteps } from './connector/fill-setup-steps';
export type { DefaultLabelOptions } from './connector/pick-default-label';
export { pickDefaultLabel } from './connector/pick-default-label';
