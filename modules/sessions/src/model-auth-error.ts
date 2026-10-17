// The model API refused the credential of the profile a turn ran on. Every retry fails the same
// way until the credential changes, so the turn's failure names it apart from any other. The
// detail is the CLI's own text for the refusal, which never quotes the conversation.
export class ModelAuthError extends Error {
  readonly detail: string;

  constructor(detail: string, options?: Readonly<ErrorOptions>) {
    super(`the conversation turn failed: the model API refused the credential: ${detail}`, options);

    this.name = 'ModelAuthError';
    this.detail = detail;
  }
}
