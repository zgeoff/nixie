import type { Log } from '@heynixie/log';
import type { WebFetchLinksSeed } from './seed-web-fetch-links';
import { seedWebFetchLinks } from './seed-web-fetch-links';

export interface ConnectorSeederDeps {
  readonly log: Pick<Log, 'writer'>;
}

export function buildConnectorSeeder(deps: ConnectorSeederDeps) {
  return {
    webFetchLinks: (input: WebFetchLinksSeed) => seedWebFetchLinks(deps.log, input),
  };
}
