// A record arrived without the snapshot hash of the definitions in force, and the log refuses it,
// because a replay needs that hash to give the same decision.
export class MissingDefinitionsError extends Error {
  override readonly name = 'MissingDefinitionsError';

  constructor(kind: unknown) {
    super(`a ${String(kind)} record carries no definitions snapshot hash`);
  }
}
