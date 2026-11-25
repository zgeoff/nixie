import { CredentialRefusalError } from '@heynixie/egress';

// A handle made before a removal meets the removal's counter. A tool call that meets it fails with
// an error, never a reply.
export class CredentialRemovedError extends CredentialRefusalError {
  public constructor(label: string) {
    super(`the credential ${label} was removed`);

    this.name = 'CredentialRemovedError';
  }
}
