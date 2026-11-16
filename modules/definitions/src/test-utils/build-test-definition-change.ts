import type { DefinitionChangeView } from '../runtime-task/pick-definition-move';

// A change of water-the-tomatoes in force, which replaced the repo's version h-r
export function buildTestDefinitionChange(
  overrides: Partial<DefinitionChangeView> = {},
): DefinitionChangeView {
  return {
    changeID: 'c1',
    shortID: 'k1',
    operation: 'change',
    hash: 'h-c1',
    previous: 'h-r',
    base: 'h-r',
    definitions: 'h-r',
    replaces: null,
    state: 'in_force',
    cause: null,
    ...overrides,
  };
}
