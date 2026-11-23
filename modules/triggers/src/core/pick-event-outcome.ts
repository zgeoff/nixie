import type { DefinitionTaskAnswer, SkipReason } from '@heynixie/tasks';
import { conversationTaskID } from '@heynixie/tasks';
import { match } from 'ts-pattern';
import type { TriggerEvent } from '../types';

export type EventOutcome =
  | { readonly kind: 'fire'; readonly thread: string }

  // nixie is paused or the spending stop stands: nothing is written, and the key stays free
  | { readonly kind: 'wait' }
  | { readonly kind: 'skip'; readonly thread: string; readonly reason: SkipReason };

// Rows 3 to 7 of the table of one deliver call. The answer is null for a conversation target, whose
// thread is the conversation's, and which heeds only nixie's pause and the spending stop: the
// caller says whether one of them holds the conversation's task.
export function pickEventOutcome(
  event: Pick<TriggerEvent, 'skip'>,
  answer: DefinitionTaskAnswer | null,
  isConversationWaiting: boolean,
): EventOutcome {
  const thread = answer === null ? conversationTaskID : answer.taskID;

  if (answer === null ? isConversationWaiting : answer.fire === 'wait') {
    return { kind: 'wait' };
  }

  if (event.skip !== undefined) {
    return { kind: 'skip', thread, reason: event.skip };
  }

  if (answer === null) {
    return { kind: 'fire', thread };
  }

  return match(answer.fire)
    .with('wait', () => ({ kind: 'wait' as const }))
    .with('take', () => ({ kind: 'fire' as const, thread }))
    .with('still_running', () => ({
      kind: 'skip' as const,
      thread,
      reason: 'still_running' as const,
    }))
    .with('held', () => ({ kind: 'skip' as const, thread, reason: 'task_held' as const }))
    .exhaustive();
}
