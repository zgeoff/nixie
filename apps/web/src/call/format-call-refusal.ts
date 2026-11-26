import { match } from 'ts-pattern';
import type { CallRefusal } from './types';

// What the call screen says when a call did not start, and what the user can do about it.
export function formatCallRefusal(refusal: CallRefusal): string {
  return match(refusal)
    .with(
      'microphone-blocked',
      () =>
        'nixie cannot use the microphone. Allow it for this site in the browser settings, then try again.',
    )
    .with('microphone-missing', () => 'This device has no microphone. Plug one in and try again.')
    .with('microphone-failed', () => 'The microphone did not open. Try again.')
    .with('voice-off', () => 'Voice calls are off on this nixie.')
    .with('speech-unavailable', () => 'This nixie has no speech service to call through.')
    .with('price-missing', () => 'Calls have no price set yet, so none can start.')
    .with('call-running', () => 'A call is already running.')
    .with('budget-reached', () => 'The call budget has no room for another minute.')
    .with('credential-refused', () => 'The speech service refused nixie. Check its key.')
    .with('failed', () => 'The call did not start. Try again.')
    .exhaustive();
}
