// The adapter refused a spec before it made anything, so no record and no sandbox exist for it.
export class SandboxSpecRefusedError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`sandbox spec refused: ${reason}`);
    this.name = 'SandboxSpecRefusedError';
    this.reason = reason;
  }
}
