import type { WakeCause } from '@heynixie/tasks';
import { match } from 'ts-pattern';

// The name of the message step of a chain, from what woke the conversation step that started it.
export function formatStartingMessage(cause: WakeCause | null): string {
  if (cause === null) {
    return 'Conversation';
  }

  return match(cause)
    .with({ kind: 'owner' }, () => 'Your message')
    .with({ kind: 'event' }, () => 'Outside content')
    .with({ kind: 'timer' }, () => 'A timer')
    .with({ kind: 'task' }, () => 'A message from a task')
    .with({ kind: 'carried' }, () => 'An earlier message')
    .exhaustive();
}
