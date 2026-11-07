export class RuleConflictError extends Error {
  override readonly name = 'RuleConflictError';

  readonly code = 'NOT_FOUND';

  constructor(ruleID: string) {
    super(`the rule ${ruleID} has no conflict between nixie's version and the repo's`);
  }
}
