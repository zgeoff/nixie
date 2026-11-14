export class MissingDefinitionsError extends Error {
  override readonly name = 'MissingDefinitionsError';

  constructor(kind: unknown) {
    super(`a ${String(kind)} record carries no definitions snapshot hash`);
  }
}
