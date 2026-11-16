import type { RuntimeTaskChange } from '../utils/build-task-seed-plan';

// A change of water-the-tomatoes that replaced the repo's version h-repo
export function buildTestRuntimeTaskChange(
  overrides: Partial<RuntimeTaskChange> = {},
): RuntimeTaskChange {
  return {
    changeID: 'c1',
    definitionID: 'water-the-tomatoes',
    hash: 'h-nixie',
    base: 'h-repo',
    definitions: 'h-repo',
    ...overrides,
  };
}
