import type { PolicyCall } from './types';

export function collectConsentSequences(
  call: Pick<PolicyCall, 'turnMessageSequence' | 'onBehalfOf'>,
): readonly number[] {
  const sequences = new Set(call.onBehalfOf);

  if (call.turnMessageSequence !== null) {
    sequences.add(call.turnMessageSequence);
  }

  return [...sequences].toSorted((left, right) => left - right);
}
