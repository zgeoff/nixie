import { faker } from '@faker-js/faker';
import type { Sandbox } from '../types';
import { buildMockSandboxSpec } from './build-mock-sandbox-spec';

export function buildMockSandbox(overrides: Partial<Sandbox> = {}): Sandbox {
  return {
    id: faker.string.uuid(),
    spec: buildMockSandboxSpec(),
    exec: requireUnused,
    spawn: requireUnused,
    copyIn: requireUnused,
    copyOut: requireUnused,
    resolveHome: requireUnused,
    readFilePaths: requireUnused,
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
