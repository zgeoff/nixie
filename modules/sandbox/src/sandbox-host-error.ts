// The call the sandbox host failed, with the host's own code and text for the failure, such as a
// wake that impd refuses with RAM_BUDGET_EXCEEDED because its memory budget is full.
interface SandboxHostFailure {
  readonly call: string;
  readonly code: string;
  readonly hostMessage: string;
}

// The sandbox host refused or failed a call. The host's code and text name the failure and never
// quote what the sandbox works on, so both may reach the log.
export class SandboxHostError extends Error {
  readonly call: string;

  readonly code: string;

  readonly hostMessage: string;

  constructor(failure: SandboxHostFailure, options?: ErrorOptions) {
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
