export class PartCycleError extends Error {
  override readonly name = 'PartCycleError';

  constructor(parts: readonly string[]) {
    super(`parts ${parts.join(', ')} need each other, so none of them can start first`);
  }
}
