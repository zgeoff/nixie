import type { WakeCause } from '@heynixie/tasks';
import { match } from 'ts-pattern';

export interface StartingMessage {
  readonly cause: WakeCause | null;

  // the owner's text when the owner's message woke the step, and null once a forget erased it
  readonly ownerText: string | null;
}

// The name of the message step of a chain, from what woke the conversation step that started it.
// An owner's message carries its own text, so two chains that two messages started read apart.
export function formatStartingMessage(starting: StartingMessage): string {
  if (starting.cause === null) {
    return 'Conversation';
  }

  return match(starting.cause)
    .with({ kind: 'owner' }, () => formatOwnerMessage(starting.ownerText))
    .with({ kind: 'event' }, () => 'Outside content')
    .with({ kind: 'timer' }, () => 'A timer')
    .with({ kind: 'task' }, () => 'A message from a task')
    .with({ kind: 'carried' }, () => 'An earlier message')
    .exhaustive();
}

const excerptLimit = 60;

function formatOwnerMessage(text: string | null): string {
  const flat = text?.replaceAll(/\s+/gu, ' ').trim() ?? '';

  if (flat === '') {
    return 'Your message';
  }

  const excerpt = flat.length > excerptLimit ? `${flat.slice(0, excerptLimit).trimEnd()}…` : flat;

  return `Your message: ${excerpt}`;
}
