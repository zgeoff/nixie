import type { SDKAssistantMessageError } from '@anthropic-ai/claude-agent-sdk';
import type { GuestFrame } from '@heynixie/wire';
import { match } from 'ts-pattern';

export interface ModelCallError {
  readonly error: SDKAssistantMessageError;

  readonly isRetried: boolean;
  readonly detail: string;
}

// The CLI retries a rate limit itself unless the model API asks for a wait past the CLI's own
// limit, so a rate limit the CLI never retried is a quota, which ends only at its reset.
export function buildModelFailure(call: ModelCallError): GuestFrame | null {
  const detail = call.detail;

  return match(call.error)
    .returnType<GuestFrame | null>()
    .with('authentication_failed', 'oauth_org_not_allowed', 'cloud_credential_error', () => ({
      type: 'failed',
      reason: 'model_auth',
      detail,
    }))
    .with('invalid_request', 'max_output_tokens', () => null)
    .with('rate_limit', () => ({
      type: 'failed',
      reason: 'model_api',
      error: call.isRetried ? 'rate_limit' : 'quota',
      detail,
    }))
    .with('overloaded', () => ({
      type: 'failed',
      reason: 'model_api',
      error: 'overloaded',
      detail,
    }))
    .with('server_error', () => ({
      type: 'failed',
      reason: 'model_api',
      error: 'server_error',
      detail,
    }))
    .with('billing_error', () => ({
      type: 'failed',
      reason: 'model_api',
      error: 'billing',
      detail,
    }))
    .with('account_on_hold', 'verification_required', () => ({
      type: 'failed',
      reason: 'model_api',
      error: 'account',
      detail,
    }))
    .with('model_not_found', () => ({
      type: 'failed',
      reason: 'model_api',
      error: 'model_not_found',
      detail,
    }))
    .with('unknown', () => ({ type: 'failed', reason: 'model_api', error: 'unknown', detail }))
    .exhaustive();
}
