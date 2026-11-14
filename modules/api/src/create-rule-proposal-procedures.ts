import type { RuleContext } from '@heynixie/definitions';
import { readPendingRuleProposals } from '@heynixie/definitions';
import { readPendingActionProposals } from '@heynixie/policy';
import type { LegacyCaller } from './answer-legacy-proposal';
import { apiImplementer } from './api-implementer';
import { buildRuleProposalEntry } from './build-rule-proposal-entry';
import { buildActionProposalEntry } from './create-host-action-procedures';
import { probeLiveIdentity } from './probe-live-identity';
import { requireCaller } from './require-caller';
import { runActionProposalAnswer } from './run-action-proposal-answer';
import { runRuleProposalAnswer } from './run-rule-proposal-answer';
import type { APIContext, Identity } from './types';

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
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      return runRuleProposalAnswer(
        context,
        { answer: 'approve', proposalID: options.input.proposalID },
        options.errors,
        buildLegacyCaller(context, caller, options.errors.UNAUTHORIZED),
      );
    }),

    rejectProposal: rules.rejectProposal.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      return runRuleProposalAnswer(
        context,
        { answer: 'reject', ...options.input },
        options.errors,
        buildLegacyCaller(context, caller, options.errors.UNAUTHORIZED),
      );
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
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const result = await runActionProposalAnswer(
        context,
        { answer: 'approve', proposalID: options.input.proposalID },
        buildLegacyCaller(context, caller, options.errors.UNAUTHORIZED),
      );

      if (result.status === 'refused') {
        throw options.errors[result.code]();
      }

      return { proposalID: result.proposalID };
    }),

    rejectActionProposal: rules.rejectActionProposal.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const result = await runActionProposalAnswer(
        context,
        {
          answer: 'reject',
          proposalID: options.input.proposalID,
          reason: options.input.reason,
        },
        buildLegacyCaller(context, caller, options.errors.UNAUTHORIZED),
      );

      if (result.status === 'refused') {
        throw options.errors[result.code]();
      }

      return { proposalID: result.proposalID };
    }),
  };
}

function buildLegacyCaller(
  context: APIContext,
  caller: Identity,
  buildUnauthorized: () => Error,
): LegacyCaller {
  return { probe: (tx) => probeLiveIdentity(tx, context, caller.identityID), buildUnauthorized };
}
