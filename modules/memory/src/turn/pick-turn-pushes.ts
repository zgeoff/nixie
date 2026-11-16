import { makeSimilarityPush } from './make-similarity-push';
import { makeTriggerPush } from './make-trigger-push';
import type { SelectPush, TurnMemorySettings } from './types';

// Trigger push always runs first, so its items take the earlier places.
export function pickTurnPushes(settings: TurnMemorySettings): readonly SelectPush[] {
  const similarity = settings.similarity;

  const isSimilarityOn =
    similarity.items > 0 || similarity.selfNotes > 0 || similarity.messages > 0;

  return [
    ...(settings.trigger.items > 0 ? [makeTriggerPush(settings.trigger)] : []),
    ...(isSimilarityOn ? [makeSimilarityPush(similarity)] : []),
  ];
}
