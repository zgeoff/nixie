import type { SandboxAdapter } from './types';

// The release bundle defines NIXIE_TEST_BUILD as false, so the bundler drops every branch that this
// check guards.
export function isTestSandbox(adapter: Pick<SandboxAdapter, 'id'>): boolean {
  return NIXIE_TEST_BUILD && adapter.id === 'process';
}
