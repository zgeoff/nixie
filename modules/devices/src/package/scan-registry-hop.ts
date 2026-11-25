import type { HopVerdict } from '@heynixie/connectors';

// Lets a redirect through only when it stays on the registry's own host.
export function scanRegistryHop(url: string, host: string): HopVerdict {
  return new URL(url).host === host
    ? { kind: 'pass' }
    : { kind: 'refuse', reason: 'the registry redirected to another host' };
}
