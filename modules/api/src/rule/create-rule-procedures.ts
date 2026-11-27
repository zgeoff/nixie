// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { readCurrentRule } from '@heynixie/definitions';
import { describeRuleCondition, renderRule } from '@heynixie/policy';
import invariant from 'tiny-invariant';
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { toConditionField } from '../utils/to-condition-field';
import type { RuleChange, RuleChangeRun } from './run-rule-change';
import { runRuleChange } from './run-rule-change';

type RuleProcedureContext = APIContext & { readonly runInForceSeed: () => Promise<unknown> };

export function createRuleProcedures(context: RuleProcedureContext) {
  const rules = apiImplementer.rules;

  return {
    readRule: rules.readRule.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const current = await readCurrentRule(context.log.writer.db, options.input.ruleID);

      if (current === null) {
        throw options.errors.NOT_FOUND();
      }

      return {
        ruleID: options.input.ruleID,
        revision: current.revision,
        sentence: renderRule(current.rule),
        ...toConditionField(describeRuleCondition(current.rule, current.origin)),
        outcome: current.rule.outcome,
        destinations: current.rule.destinations ?? [],
      };
    }),

    removeRule: rules.removeRule.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const ruleID = options.input.ruleID;

      const run = await runRuleChange(context, caller, {
        clientActionID: options.input.clientActionID,
        procedure: 'rules.removeRule',
        ruleID,
        request: { action: 'remove', revision: options.input.revision },
      });

      toChangeError(run, options.errors);

      return { ruleID };
    }),

    editRule: rules.editRule.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const ruleID = options.input.ruleID;

      const change: RuleChange = {
        clientActionID: options.input.clientActionID,
        procedure: 'rules.editRule',
        ruleID,
        request: {
          action: 'edit',
          revision: options.input.revision,
          destinations: options.input.destinations,
        },
      };

      const run = await runRuleChange(context, caller, change);

      toChangeError(run, options.errors);
      invariant(run.status === 'done' && run.revision !== null, 'an edit records its revision');

      return { ruleID, revision: run.revision };
    }),
  };
}

interface ConflictOptions {
  readonly data: { readonly revision: number };
}

interface NotAllowedOptions {
  readonly data: { readonly reason: 'widens' | 'empty' | 'mandate' };
}

interface ChangeErrors {
  readonly UNAUTHORIZED: () => Error;
  readonly CLIENT_ACTION_ID_REUSED: () => Error;
  readonly NOT_FOUND: () => Error;
  readonly CONFLICT: (options: ConflictOptions) => Error;
  readonly NOT_ALLOWED: (options: NotAllowedOptions) => Error;
}

function toChangeError(run: RuleChangeRun, errors: ChangeErrors): void {
  if (run.status === 'unauthorized') {
    throw errors.UNAUTHORIZED();
  }

  if (run.status === 'reused') {
    throw errors.CLIENT_ACTION_ID_REUSED();
  }

  if (run.status === 'refused') {
    const outcome = run.outcome;

    if (outcome.code === 'CONFLICT') {
      throw errors.CONFLICT({ data: { revision: outcome.revision } });
    }

    if (outcome.code === 'NOT_ALLOWED') {
      throw errors.NOT_ALLOWED({ data: { reason: outcome.reason } });
    }

    throw errors.NOT_FOUND();
  }
}
