// A fetcher's own refusal, so an adapter can tell it apart from an outside failure. A tool call
// that meets it fails with an error, never a reply.
export class CredentialRefusalError extends Error {
  constructor(message: string) {
    super(message);

    this.name = 'CredentialRefusalError';
  }
}
