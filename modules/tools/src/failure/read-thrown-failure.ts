import { CredentialRefusalError } from '@heynixie/egress';
import type { ConnectorFailure } from '../types';

// A tool that reaches a provider throws when no answer came back. The fetcher's own refusal never
// reached the provider, so a retry could not change it. Any other throw counts as no answer. Its
// text stays out of the failure, because it can quote outside text.
export function readThrownFailure(error: unknown): ConnectorFailure {
  return error instanceof CredentialRefusalError
    ? { code: 'fetch_refused', detail: error.message }
    : { code: 'no_answer' };
}
