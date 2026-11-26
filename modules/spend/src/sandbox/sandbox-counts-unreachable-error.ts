// The gateway did not answer a call that registers a sandbox's count. The sandbox is whole, so a
// caller may wait and ask again.
export class SandboxCountsUnreachableError extends Error {
  readonly sandboxID: string;

  constructor(sandboxID: string, reason: string) {
    super(`the gateway did not register the sandbox ${sandboxID}: ${reason}`);

    this.name = 'SandboxCountsUnreachableError';
    this.sandboxID = sandboxID;
  }
}
