import type { TurnMemorySettings } from './types';

export const defaultTurnSettings: TurnMemorySettings = {
  trigger: { items: 3, minScore: 6.4, minSimilarity: 0.57 },
};
