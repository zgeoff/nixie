export class SandboxSpecRefusedError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`sandbox spec refused: ${reason}`);

    this.name = 'SandboxSpecRefusedError';
    this.reason = reason;
  }
}
