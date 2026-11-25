import type { ValueForm } from '@heynixie/egress';
import { CredentialRefusalError, scrubText } from '@heynixie/egress';
import { CredentialRemovedError } from '../held/credential-removed-error';

// The cleaned error keeps the name and the cleaned message and drops the cause, which may hold the
// value: a caller's abort reason reaches here too.
export function cleanError(error: unknown, forms: readonly ValueForm[]): unknown {
  if (error instanceof CredentialRemovedError) {
    return error;
  }

  if (error instanceof CredentialRefusalError) {
    return new CredentialRefusalError(scrubText(error.message, forms));
  }

  if (!(error instanceof Error)) {
    return new Error(scrubText(String(error), forms));
  }

  const cleaned = new Error(scrubText(error.message, forms));

  cleaned.name = scrubText(error.name, forms);

  return cleaned;
}
