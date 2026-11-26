import type { SandboxCount } from '@heynixie/spend';

// A gateway's answer to a read of a sandbox, at the given dollars.
export function buildCountAnswer(dollars: number, lastRefusal: SandboxCount['lastRefusal'] = null) {
  return {
    kind: 'ok' as const,
    value: { dollars, tokens: 0, tripped: false, lastRefusal, limitRevision: 0 },
  };
}
