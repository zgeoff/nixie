import { match } from 'ts-pattern';

export function formatFailureCause(reason: string | undefined): string | null {
  return match(reason)
    .with('model_api.quota', () => 'Claude quota reached')
    .with('model_api.rate_limit', () => 'Claude rate limit reached')
    .with('model_api.overloaded', () => 'Claude is overloaded')
    .with('model_api.server_error', () => 'Claude server error')
    .with('model_api.billing', () => 'Claude billing problem')
    .with('model_api.account', () => 'Claude account needs attention')
    .with('model_api.model_not_found', () => 'Claude model not found')
    .otherwise((other) => (other?.startsWith('model_api.') === true ? 'Claude API error' : null));
}
