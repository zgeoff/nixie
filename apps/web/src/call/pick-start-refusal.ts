import { match } from 'ts-pattern';
import type { CallRefusal } from './types';

// The refusal that a failed start or connect means for the call, from the error's code.
export function pickStartRefusal(error: unknown): CallRefusal {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';

  return match(code)
    .with('VOICE_OFF', () => 'voice-off' as const)
    .with('SPEECH_UNAVAILABLE', () => 'speech-unavailable' as const)
    .with('VOICE_PRICE_MISSING', () => 'price-missing' as const)
    .with('CALL_RUNNING', () => 'call-running' as const)
    .with('CALL_BUDGET_REACHED', () => 'budget-reached' as const)
    .with('VOICE_CREDENTIAL_REFUSED', () => 'credential-refused' as const)
    .otherwise(() => 'failed' as const);
}
