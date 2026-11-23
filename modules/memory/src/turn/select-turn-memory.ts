import type { TurnMemoryAsk } from '@heynixie/sessions';
import type { SearchMode } from '../types';
import { buildPushExclusions } from './build-push-exclusions';
import { pickTurnPushes } from './pick-turn-pushes';
import type { PushPick, TurnMemorySettings, TurnSources } from './types';

export type TurnSelection =
  | {
      readonly kind: 'selected';
      readonly picks: readonly PushPick[];
      readonly searchModes: readonly SearchMode[];
    }
  | { readonly kind: 'none' };

// Appends nothing. With every push off or a blank text it reads nothing, and neither `held`
// function runs.
export async function selectTurnMemory(
  sources: TurnSources,
  settings: TurnMemorySettings,
  ask: TurnMemoryAsk,
): Promise<TurnSelection> {
  const pushes = pickTurnPushes(settings);

  if (pushes.length === 0 || ask.text.trim() === '') {
    return { kind: 'none' };
  }

  const held = await ask.held.readVersions();
  const writeStart = await ask.held.readWriteStart();
  const states = await sources.readItemStates();

  const written =
    writeStart === null
      ? []
      : await sources.readWrittenItemIDs({ thread: ask.thread, afterSequence: writeStart });

  const exclusions = buildPushExclusions(states, held, written);
  const picks: PushPick[] = [];
  const searchModes: SearchMode[] = [];

  for (const push of pushes) {
    const result = await push(sources, {
      ...ask,
      states,
      excludedIDs: [...exclusions, ...picks.map((pick) => pick.itemID)],
    });

    picks.push(...result.picks);
    searchModes.push(...result.searchModes);
  }

  return picks.length === 0 ? { kind: 'none' } : { kind: 'selected', picks, searchModes };
}
