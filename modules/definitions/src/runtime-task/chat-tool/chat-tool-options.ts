import type { ReadZone } from '@heynixie/triggers';
import type { DefinitionsContext } from '../types';

export interface ChatToolOptions {
  // null until the definitions are started
  readonly readDefinitions: () => DefinitionsContext | null;

  readonly readZone: ReadZone;
}

export const notReadyMessage = 'Task definitions are not ready yet. Try again shortly.';
