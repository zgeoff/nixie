export class MissingCredentialError extends Error {
  constructor(message: string) {
    super(message);

    this.name = 'MissingCredentialError';
  }
}
