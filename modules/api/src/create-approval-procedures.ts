// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import type { AnswerSettlement } from '@heynixie/proposals';
import { apiImplementer } from './api-implementer';
import { buildProposalCoreDeps } from './build-proposal-core-deps';
import type { ProposalParts } from './build-proposal-core-deps';
import { readApprovalItems } from './read-approval-items';
import { requireCaller } from './require-caller';
import type { ApprovalAnswer } from './run-approval-answer';
import { runApprovalAnswer } from './run-approval-answer';
import type { APIContext } from './types';

export function createApprovalProcedures(context: APIContext, parts: ProposalParts) {
  const approvals = apiImplementer.approvals;
  const deps = buildProposalCoreDeps(context, parts);

  return {
    listItems: approvals.listItems.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      return readApprovalItems(context, deps, parts.readMemory);
    }),

    answerProposal: approvals.answerProposal.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const run = await runApprovalAnswer(context, deps, caller, options.input);

      if (run.status === 'unauthorized') {
        throw options.errors.UNAUTHORIZED();
      }

      if (run.status === 'reused') {
        throw options.errors.CLIENT_ACTION_ID_REUSED();
      }

      const settlement = run.settlement;

      if (settlement.status === 'answered') {
        return settlement.result;
      }

      const refusal = settlement.refusal;

      if (refusal.error === 'CONFLICT') {
        throw options.errors.CONFLICT({ data: { current: refusal.current } });
      }

      if (refusal.error === 'CLOSED') {
        throw options.errors.CLOSED({ data: { state: refusal.state } });
      }

      throw options.errors.NOT_ALLOWED({
        data: { reason: refusal.error === 'NOT_FOUND' ? 'not_found' : refusal.reason },
      });
    }),

    answerProposals: approvals.answerProposals.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const results = [];

      for (const answer of options.input.answers) {
        const run = await runApprovalAnswer(context, deps, caller, answer);

        if (run.status === 'unauthorized') {
          throw options.errors.UNAUTHORIZED();
        }

        const result =
          run.status === 'reused'
            ? {
                proposalID: answer.proposalID,
                error: 'NOT_ALLOWED' as const,
                reason: 'client_action_id_reused',
              }
            : toBatchResult(answer, run.settlement);

        results.push(result);
      }

      return { results };
    }),
  };
}

function toBatchResult(answer: ApprovalAnswer, settlement: AnswerSettlement) {
  if (settlement.status === 'answered') {
    return settlement.result;
  }

  const refusal = settlement.refusal;

  if (refusal.error === 'CONFLICT') {
    return { proposalID: answer.proposalID, error: 'CONFLICT' as const, current: refusal.current };
  }

  if (refusal.error === 'CLOSED') {
    return { proposalID: answer.proposalID, error: 'CLOSED' as const, state: refusal.state };
  }

  return {
    proposalID: answer.proposalID,
    error: 'NOT_ALLOWED' as const,
    reason: refusal.error === 'NOT_FOUND' ? 'not_found' : refusal.reason,
  };
}
