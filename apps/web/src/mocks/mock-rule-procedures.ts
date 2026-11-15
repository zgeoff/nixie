// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { mockImplementer } from './mock-implementer';
import { requireMockSession } from './require-mock-session';
import { store } from './store';
import type { MockRuleChange } from './write-mock-rule-change';
import { writeMockRuleChange } from './write-mock-rule-change';

const rules = mockImplementer.rules;

export const mockRuleProcedures = {
  readRule: rules.readRule.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const rule = store.rules.findFirst((query) => query.where({ ruleID: options.input.ruleID }));

    if (rule === undefined) {
      throw options.errors.NOT_FOUND();
    }

    return {
      destinations: [...rule.destinations],
      outcome: rule.outcome,
      revision: rule.revision,
      ruleID: rule.ruleID,
      sentence: rule.sentence,
    };
  }),

  removeRule: rules.removeRule.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const ruleID = options.input.ruleID;

    const result = await writeMockRuleChange({
      action: 'remove',
      ruleID,
      revision: options.input.revision,
    });

    if (result.status === 'refused') {
      throw toRuleError(result, options.errors);
    }

    return { ruleID };
  }),

  editRule: rules.editRule.handler(async (options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const ruleID = options.input.ruleID;

    const change: MockRuleChange = {
      action: 'edit',
      ruleID,
      revision: options.input.revision,
      destinations: options.input.destinations,
    };

    const result = await writeMockRuleChange(change);

    if (result.status === 'refused') {
      throw toRuleError(result, options.errors);
    }

    return { ruleID, revision: result.revision };
  }),
};

interface ConflictOptions {
  readonly data: { readonly revision: number };
}

interface NotAllowedOptions {
  readonly data: { readonly reason: 'widens' | 'empty' };
}

interface RuleErrors {
  readonly NOT_FOUND: () => Error;
  readonly CONFLICT: (options: ConflictOptions) => Error;
  readonly NOT_ALLOWED: (options: NotAllowedOptions) => Error;
}

type RefusedRuleChange = Extract<
  Awaited<ReturnType<typeof writeMockRuleChange>>,
  { status: 'refused' }
>;

function toRuleError(result: RefusedRuleChange, errors: RuleErrors): Error {
  if (result.error === 'CONFLICT') {
    return errors.CONFLICT({ data: { revision: result.revision } });
  }

  if (result.error === 'NOT_ALLOWED') {
    return errors.NOT_ALLOWED({ data: { reason: result.reason } });
  }

  return errors.NOT_FOUND();
}
