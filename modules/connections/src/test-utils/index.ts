export type { FakeGoogle, FakeGoogleAccount, FakeGoogleOptions } from './answer-google-consent';
export { answerGoogleConsent } from './answer-google-consent';
export type { ConnectionsHarness, ConnectionsHarnessOptions } from './start-connections-harness';
export { startConnectionsHarness } from './start-connections-harness';
export type { GoogleConnections, StartedConsent } from './start-google-connections';

export {
  googleClientID,
  googleOrigin,
  googleScopes,
  startGoogleConnections,
} from './start-google-connections';

export {
  buildTestConnector,
  buildTestOAuthSpec,
  testConnectorScopes,
} from './build-test-connector';

export type { TestConnectorHosts } from './build-test-connector';
export { seedConnectionStatus } from './seed-connection-status';
export { seedGrantEnd } from './seed-grant-end';
