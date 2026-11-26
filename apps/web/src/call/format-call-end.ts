import { match } from 'ts-pattern';
import type { CallEndedBy } from './types';

// Who ended the call, in a sentence.
export function formatCallEnd(endedBy: CallEndedBy | null): string {
  return match(endedBy)
    .with('you', () => 'You hung up.')
    .with('nixie', () => 'nixie ended the call.')
    .with('budget', () => 'The call budget ran out.')
    .with('dropped', () => 'The connection dropped.')
    .with('missed', () => 'The call went unanswered.')
    .with('declined', () => 'The call was declined.')
    .with(null, () => 'The call ended.')
    .exhaustive();
}
