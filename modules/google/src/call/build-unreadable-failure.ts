import type { ConnectorFailure } from '@heynixie/tools';

export function buildUnreadableFailure(detail: string): ConnectorFailure {
  return { code: 'failed', detail };
}
