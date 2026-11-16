import type { TurnMemorySettings } from './types';

// The similarity limits stay 0 until a deployment sets a `retrieval_*` key above 0.
export const defaultTurnSettings: TurnMemorySettings = {
  trigger: { items: 3, minScore: 6.4, minSimilarity: 0.57 },
  similarity: { items: 0, selfNotes: 0, messages: 0, minScore: 0.25, minSimilarity: 0.38 },
};
