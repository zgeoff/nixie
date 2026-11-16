import type { LiveRecord } from '../conversation/use-live-records';

type DefinitionNotice = NonNullable<LiveRecord['definitionNotice']>;

// The notice of an add of water-the-tomatoes that is in force
export function buildMockDefinitionNotice(
  overrides: Partial<DefinitionNotice> = {},
): DefinitionNotice {
  return {
    definitionID: 'water-the-tomatoes',
    name: 'Water the tomatoes',
    operation: 'add',
    shortID: 'k3x9m2p7qa',
    changeID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    rendered: 'every Friday at 08:00',
    next: 'Fri 12 Mar',
    state: 'in_force',
    isUnreadable: false,
    ...overrides,
  };
}
