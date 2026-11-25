export type StartRefusal =
  | 'VOICE_OFF'
  | 'SPEECH_UNAVAILABLE'
  | 'VOICE_PRICE_MISSING'
  | 'CALL_RUNNING'
  | 'CALL_BUDGET_REACHED';

export interface StartFacts {
  readonly isVoiceOn: boolean;
  readonly hasSpeechLayer: boolean;
  readonly pricePerMinuteMicros: number | null;
  readonly isCallRunning: boolean;

  // each call budget, with what its period has spent
  readonly budgets: readonly { readonly spentMicros: number; readonly limitMicros: number }[];
}

// The first refusal in this order, or null when a call may start.
export function pickStartRefusal(facts: StartFacts): StartRefusal | null {
  if (!facts.isVoiceOn) {
    return 'VOICE_OFF';
  }

  if (!facts.hasSpeechLayer) {
    return 'SPEECH_UNAVAILABLE';
  }

  if (facts.pricePerMinuteMicros === null) {
    return 'VOICE_PRICE_MISSING';
  }

  if (facts.isCallRunning) {
    return 'CALL_RUNNING';
  }

  const price = facts.pricePerMinuteMicros;

  const isOverBudget = facts.budgets.some(
    (budget) => budget.spentMicros + price > budget.limitMicros,
  );

  return isOverBudget ? 'CALL_BUDGET_REACHED' : null;
}
