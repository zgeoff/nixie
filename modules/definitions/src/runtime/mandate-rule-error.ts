export class MandateRuleError extends Error {
  override readonly name = 'MandateRuleError';

  readonly code = 'MANDATE_RULE';

  constructor(ruleID: string) {
    super(`the rule ${ruleID} belongs to a mandate, which only ends it`);
  }
}
