interface SandboxHostFailure {
  readonly call: string;
  readonly code: string;
  readonly hostMessage: string;
}

export class SandboxHostError extends Error {
  readonly call: string;

  readonly code: string;

  readonly hostMessage: string;

  constructor(failure: SandboxHostFailure, options?: Readonly<ErrorOptions>) {
    super(
      `the sandbox host failed the ${failure.call} with ${failure.code}: ${failure.hostMessage}`,
      options,
    );

    this.name = 'SandboxHostError';
    this.call = failure.call;
    this.code = failure.code;
    this.hostMessage = failure.hostMessage;
  }
}
