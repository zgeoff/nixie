export class ModelAuthError extends Error {
  // The CLI's own text for the refusal, which never quotes the conversation, so a log may hold it.
  readonly detail: string;

  constructor(detail: string, options?: Readonly<ErrorOptions>) {
    super(`the conversation turn failed: the model API refused the credential: ${detail}`, options);

    this.name = 'ModelAuthError';
    this.detail = detail;
  }
}
