import type { RuleContext } from '@heynixie/definitions';
import { readPendingRuleProposals } from '@heynixie/definitions';
import { apiImplementer } from './api-implementer';
import { buildRuleProposalEntry } from './build-rule-proposal-entry';
import { requireCaller } from './require-caller';
import { runRuleProposalAnswer } from './run-rule-proposal-answer';
import type { APIContext } from './types';

type RuleProposalContext = APIContext & Pick<RuleContext, 'seedInForce'>;

export function createRuleProposalProcedures(context: RuleProposalContext) {
  const rules = apiImplementer.rules;

  return {
    listProposals: rules.listProposals.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const pending = await readPendingRuleProposals(context.log.writer.db, context.clock.now());

      return { proposals: pending.map((entry) => buildRuleProposalEntry(entry)) };
    }),

    approveProposal: rules.approveProposal.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      return runRuleProposalAnswer(
        context,
        { answer: 'approve', proposalID: options.input.proposalID },
        options.errors,
      );
    }),

    rejectProposal: rules.rejectProposal.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      return runRuleProposalAnswer(context, { answer: 'reject', ...options.input }, options.errors);
    }),
  };
}
