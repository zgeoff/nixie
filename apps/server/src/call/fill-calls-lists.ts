import { voiceDefinitionSection } from '@heynixie/calls';
import { definitionSections } from '@heynixie/definitions';

interface CallsListsConfig {
  readonly voice?: unknown;
}

// Fills the core lists that calls add to, and empties them when voice is off. It runs before any part
// starts, because the seed of the definitions reads the list.
export function fillCallsLists(config: CallsListsConfig): void {
  const sections = config.voice === undefined ? [] : [voiceDefinitionSection];

  definitionSections.set(sections);
}
