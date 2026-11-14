import { expect, test } from 'bun:test';
import { buildModelFailure } from './build-model-failure';

test.each([
  ['authentication_failed'],
  ['oauth_org_not_allowed'],
  ['cloud_credential_error'],
] as const)('it fails the turn on the credential for %s', (sdkError) => {
  expect(
    buildModelFailure({
      error: sdkError,
      isRetried: false,
      detail: 'Invalid API key · Fix external API key',
    }),
  ).toStrictEqual({
    type: 'failed',
    reason: 'model_auth',
    detail: 'Invalid API key · Fix external API key',
  });
});

test.each([['invalid_request'], ['max_output_tokens']] as const)(
  'it leaves %s to the turn end, which tells an overflow apart',
  (sdkError) => {
    expect(
      buildModelFailure({
        error: sdkError,
        isRetried: false,
        detail: 'API Error: 400 prompt is too long',
      }),
    ).toBeNull();
  },
);

test.each([
  ['overloaded', false, 'overloaded'],
  ['server_error', true, 'server_error'],
  ['billing_error', false, 'billing'],
  ['account_on_hold', false, 'account'],
  ['verification_required', false, 'account'],
  ['model_not_found', false, 'model_not_found'],
  ['unknown', false, 'unknown'],
] as const)('it fails the turn on the model API for %s', (sdkError, isRetried, kind) => {
  expect(
    buildModelFailure({ error: sdkError, isRetried, detail: 'API Error: 529 Overloaded' }),
  ).toStrictEqual({
    type: 'failed',
    reason: 'model_api',
    error: kind,
    detail: 'API Error: 529 Overloaded',
  });
});

test('it reads a rate limit the CLI retried before it gave up as a rate limit', () => {
  expect(
    buildModelFailure({
      error: 'rate_limit',
      isRetried: true,
      detail: 'API Error: Request rejected (429) · Too many requests this minute',
    }),
  ).toStrictEqual({
    type: 'failed',
    reason: 'model_api',
    error: 'rate_limit',
    detail: 'API Error: Request rejected (429) · Too many requests this minute',
  });
});

test('it reads a rate limit the CLI never retried as a quota', () => {
  expect(
    buildModelFailure({
      error: 'rate_limit',
      isRetried: false,
      detail: 'API Error: Request rejected (429) · Weekly allowance used up',
    }),
  ).toStrictEqual({
    type: 'failed',
    reason: 'model_api',
    error: 'quota',
    detail: 'API Error: Request rejected (429) · Weekly allowance used up',
  });
});
