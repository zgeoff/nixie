import type { TurnMemory, TurnMemoryAsk } from '@heynixie/sessions';
import type { StoreParts } from '../types';
import { buildTurnSources } from './build-turn-sources';
import { defaultTurnSettings } from './default-turn-settings';
import { placeTurnMemory } from './place-turn-memory';
import { selectTurnMemory } from './select-turn-memory';

// A rejected search or log read rejects here, and the step runner records it and retries.
export async function readTurnMemory(parts: StoreParts, ask: TurnMemoryAsk): Promise<TurnMemory> {
  const settings = parts.context.turn ?? defaultTurnSettings;

  const selection = await selectTurnMemory(buildTurnSources(parts), settings, ask);

  return selection.kind === 'none'
    ? { kind: 'none' }
    : placeTurnMemory(parts, ask.thread, selection);
}
