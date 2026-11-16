import type { DefinitionTaskAnswer, SkipReason } from '@heynixie/tasks';
import { conversationTaskID } from '@heynixie/tasks';
import { match } from 'ts-pattern';
import type { TriggerEvent } from '../types';

export type EventOutcome =
  | { readonly kind: 'fire'; readonly thread: string }
  | { readonly kind: 'skip'; readonly thread: string; readonly reason: SkipReason };

// Rows 3 to 6 of the table of one deliver call. The answer is null for a conversation target, whose
// thread is the conversation's.
export function pickEventOutcome(
  event: Pick<TriggerEvent, 'skip'>,
  answer: DefinitionTaskAnswer | null,
): EventOutcome {
  const thread = answer === null ? conversationTaskID : answer.taskID;

  if (event.skip !== undefined) {
    return { kind: 'skip', thread, reason: event.skip };
  }

  if (answer === null) {
    return { kind: 'fire', thread };
  }

  return match(answer.fire)
    .with('take', () => ({ kind: 'fire' as const, thread }))
    .with('still_running', () => ({
      kind: 'skip' as const,
      thread,
      reason: 'still_running' as const,
    }))
    .with('held', () => ({ kind: 'skip' as const, thread, reason: 'task_held' as const }))
    .exhaustive();
}
