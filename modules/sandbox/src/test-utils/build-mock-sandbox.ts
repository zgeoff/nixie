import { faker } from '@faker-js/faker';
import type { Sandbox } from '../types';
import { buildMockSandboxSpec } from './build-mock-sandbox-spec';

// A kept sandbox on a default spec, for code that only reads a sandbox's ID, spec and retirement.
// Every call into the sandbox rejects, and its destroy resolves.
export function buildMockSandbox(overrides: Partial<Sandbox> = {}): Sandbox {
  return {
    id: faker.string.uuid(),
    spec: buildMockSandboxSpec(),
    exec: requireUnused,
    spawn: requireUnused,
    copyIn: requireUnused,
    copyOut: requireUnused,
    resolveHome: requireUnused,
    collectFiles: requireUnused,
    applyMove: requireUnused,
    toolRoute: requireUnused,
    suspension: { kind: 'none' },
    destroy: () => Promise.resolve(),
    isRetired: false,
    ...overrides,
  };
}

function requireUnused(): Promise<never> {
  return Promise.reject(new Error('the mock sandbox runs nothing'));
}
