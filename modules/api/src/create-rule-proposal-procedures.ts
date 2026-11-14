import type { RuleContext } from '@heynixie/definitions';
import { readPendingRuleProposals } from '@heynixie/definitions';
import { readPendingActionProposals } from '@heynixie/policy';
import { apiImplementer } from './api-implementer';
import { buildRuleProposalEntry } from './build-rule-proposal-entry';
import { buildActionProposalEntry } from './create-host-action-procedures';
import { requireCaller } from './require-caller';
import { runActionProposalAnswer } from './run-action-proposal-answer';
import { runRuleProposalAnswer } from './run-rule-proposal-answer';
import type { APIContext } from './types';

type RuleProposalContext = APIContext & Pick<RuleContext, 'runInForceSeed'>;

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

    listActionProposals: rules.listActionProposals.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const pending = await readPendingActionProposals(context.log, context.clock.now());

      return {
        proposals: pending.map((entry) => {
          const listed = buildActionProposalEntry(entry);

          return {
            proposalID: listed.proposalID,
            tool: listed.tool,
            sentence: listed.sentence,
            destinations: listed.destinations,
            createdAt: listed.createdAt,
            lapseAt: listed.lapseAt,
          };
        }),
      };
    }),

    approveActionProposal: rules.approveActionProposal.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const result = await runActionProposalAnswer(context, {
        answer: 'approve',
        proposalID: options.input.proposalID,
      });

      if (result.status === 'refused') {
        throw options.errors[result.code]();
      }

      return { proposalID: result.proposalID };
    }),

    rejectActionProposal: rules.rejectActionProposal.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const result = await runActionProposalAnswer(context, {
        answer: 'reject',
        proposalID: options.input.proposalID,
        reason: options.input.reason,
      });

      if (result.status === 'refused') {
        throw options.errors[result.code]();
      }

      return { proposalID: result.proposalID };
    }),
  };
}
