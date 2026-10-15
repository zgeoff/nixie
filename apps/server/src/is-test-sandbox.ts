import type { SandboxAdapter } from '@heynixie/sandbox';

// Whether the adapter is the test sandbox, the process double, which runs each guest from the
// workspace instead of from its image. The release bundle defines NIXIE_TEST_BUILD as false, so it
// drops every branch that this guards.
export function isTestSandbox(adapter: Pick<SandboxAdapter, 'id'>): boolean {
  return NIXIE_TEST_BUILD && adapter.id === 'process';
}
