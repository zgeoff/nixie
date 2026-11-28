import type { ServerFacts } from '../types';

// The facts of the untrusted server `tracker`, for a test to change one fact of.
export function buildServerFacts(overrides: Partial<ServerFacts> = {}): ServerFacts {
  return {
    url: 'https://tracker.example.org/mcp',
    clientID: 'nixie-7f3a',
    scope: 'read write',
    privateRange: null,
    ...overrides,
  };
}
