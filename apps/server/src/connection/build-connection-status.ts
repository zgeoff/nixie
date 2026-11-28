import type { AttentionConnection } from '@heynixie/connections';
import type { StatusEntry } from '@heynixie/sessions';
import type { ModelCredentialExpiry } from './render-connection-status';
import { renderConnectionStatus } from './render-connection-status';

export interface ConnectionStatusOptions {
  readonly readAttention: () => Promise<readonly AttentionConnection[]>;

  // the model credential's expiry, when it expires within the warning time; null otherwise
  readonly readModelCredential?: () => Promise<ModelCredentialExpiry | null>;
}

// The conversation's status entry for its connections. A session that opens while every connection
// works gets no line, so the status costs nothing then.
export function buildConnectionStatus(options: ConnectionStatusOptions): StatusEntry {
  return {
    name: 'connections',
    read: async (facts) => {
      const connections = await options.readAttention();
      const credential = await options.readModelCredential?.();

      const modelCredential = credential ?? null;

      return {
        value: connections.length + (modelCredential === null ? 0 : 1),
        text: renderConnectionStatus({
          connections,
          modelCredential,
          timeZone: facts.zone ?? facts.times.defaultZone,
        }),
      };
    },
  };
}
