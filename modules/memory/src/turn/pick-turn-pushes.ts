import { makeTriggerPush } from './make-trigger-push';
import type { SelectPush, TurnMemorySettings } from './types';

export function pickTurnPushes(settings: TurnMemorySettings): readonly SelectPush[] {
  return settings.trigger.items > 0 ? [makeTriggerPush(settings.trigger)] : [];
}
