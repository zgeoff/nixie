// A source refused to take a snapshot, such as at a symlink that leads outside the definitions root
// or a file past a size limit. paths names every file that broke the rule.
export class SnapshotError extends Error {
  override readonly name = 'SnapshotError';
  readonly paths: readonly string[];

  constructor(message: string, paths: readonly string[]) {
    super(`${message}: ${paths.join(', ')}`);
    this.paths = paths;
  }
}
