import type { Connector, ConnectorAction } from '@heynixie/connections';
import type { GoogleProvider } from '../types';

// The Google connector, with the tools that it holds.
export function buildGoogleConnector(
  provider: GoogleProvider,
  actions: readonly ConnectorAction[] = [],
): Connector {
  return {
    id: 'google',
    auth: provider.auth,
    setup: provider.setup,
    actions,
    check: provider.check,
  };
}
