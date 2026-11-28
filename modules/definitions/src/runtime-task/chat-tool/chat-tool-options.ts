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

  // what task.define pins a definition's connector tools to; without it, a definition pins nothing
  readonly connections?: {
    // for each tool that needs a connection, by name, the short IDs of the connections that hold
    // its scopes now
    readonly readUsable: () => Promise<Readonly<Record<string, readonly string[]>>>;
  };
}

export const notReadyMessage = 'Task definitions are not ready yet. Try again shortly.';
