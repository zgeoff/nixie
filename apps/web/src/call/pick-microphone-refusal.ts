import { match } from 'ts-pattern';
import type { CallRefusal } from './types';

// The refusal that a failed microphone request means for the call. A browser raises a
// NotAllowedError for a block and for a closed prompt alike.
export function pickMicrophoneRefusal(error: unknown): CallRefusal {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';

  return match(name)
    .with('NotAllowedError', 'SecurityError', () => 'microphone-blocked' as const)
    .with('NotFoundError', 'OverconstrainedError', () => 'microphone-missing' as const)
    .otherwise(() => 'microphone-failed' as const);
}
