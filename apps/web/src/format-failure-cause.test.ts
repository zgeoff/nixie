import { expect, test } from 'bun:test';
import { formatFailureCause } from './format-failure-cause';

test.each([
  ['model_api.quota', 'Claude quota reached'],
  ['model_api.rate_limit', 'Claude rate limit reached'],
  ['model_api.overloaded', 'Claude is overloaded'],
  ['model_api.server_error', 'Claude server error'],
  ['model_api.billing', 'Claude billing problem'],
  ['model_api.account', 'Claude account needs attention'],
  ['model_api.model_not_found', 'Claude model not found'],
  ['model_api.unknown', 'Claude API error'],
])('it names the cause of %s in plain words', (reason, cause) => {
  expect(formatFailureCause(reason)).toBe(cause);
});

test('it names a model API refusal it does not know as an API error', () => {
  expect(formatFailureCause('model_api.content_filter')).toBe('Claude API error');
});

test('it names no cause for a step that failed outside the model API', () => {
  expect(formatFailureCause('sandbox_host')).toBeNull();
});

test('it names no cause for a step error with no reason', () => {
  expect(formatFailureCause(undefined)).toBeNull();
});
