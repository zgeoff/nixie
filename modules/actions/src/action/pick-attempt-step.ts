import type { ActionRow } from '../types';
import type { AttemptVerdict } from './attempt-check';

export type AttemptStep =
  | {
      readonly kind: 'go';
      readonly destinations: readonly string[];
      readonly replyTargets: readonly string[];
    }
  | { readonly kind: 'deny'; readonly verdict: Extract<AttemptVerdict, { kind: 'deny' }> }
  | { readonly kind: 'hold'; readonly verdict: Extract<AttemptVerdict, { kind: 'ask' }> };

// An approval answered the question once, so an approved action asks again only when it newly falls
// in the always-ask set and its approval was a routine one. An action that a rule allowed asks
// whatever the cause.
export function pickAttemptStep(
  verdict: AttemptVerdict,
  action: Pick<ActionRow, 'is_approved' | 'risk_class'>,
): AttemptStep {
  if (verdict.kind === 'go') {
    return {
      kind: 'go',
      destinations: verdict.destinations,
      replyTargets: verdict.replyTargets ?? [],
    };
  }

  if (verdict.kind === 'deny') {
    return { kind: 'deny', verdict };
  }

  const isAnswered = action.is_approved === 1;
  const isNewlyAlwaysAsk = verdict.cause === 'always_ask' && action.risk_class === 'routine';

  return isAnswered && !isNewlyAlwaysAsk
    ? {
        kind: 'go',
        destinations: verdict.destinations,
        replyTargets: verdict.replyTargets ?? [],
      }
    : { kind: 'hold', verdict };
}
