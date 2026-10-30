import { match } from 'ts-pattern';

export type SendResult = { kind: 'answered'; status: number } | { kind: 'failed'; error: unknown };

export interface SendOutcome {
  // the push service's status, or 0 when no answer came
  status: number;
  // the push service answers 404 or 410 for a subscription that is gone for good
  removeSubscription: boolean;
  failure: { error: unknown } | null;
}

export function pickSendOutcome(result: SendResult): SendOutcome {
  return match(result)
    .with({ kind: 'answered' }, ({ status }) => ({
      status,
      removeSubscription: status === 404 || status === 410,
      failure: null,
    }))
    .with({ kind: 'failed' }, ({ error }) => ({
      status: 0,
      removeSubscription: false,
      failure: { error },
    }))
    .exhaustive();
}
