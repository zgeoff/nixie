export class SnapshotError extends Error {
  override readonly name = 'SnapshotError';

  readonly paths: readonly string[];

  constructor(message: string, paths: readonly string[]) {
    super(`${message}: ${paths.join(', ')}`);

    this.paths = paths;
  }
}
