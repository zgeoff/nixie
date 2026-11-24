import type { RelatedMemoryLookup } from '@heynixie/tools';
import type { ReadZone } from '@heynixie/triggers';
import type { DefinitionsContext } from '../types';

export interface ChatToolOptions {
  // null until the definitions are started
  readonly readDefinitions: () => DefinitionsContext | null;

  readonly readZone: ReadZone;

  // what task.define looks up in memory after it applies; without it, the result carries no
  // `related`
  readonly relatedMemory?: RelatedMemoryLookup;
}

export const notReadyMessage = 'Task definitions are not ready yet. Try again shortly.';
