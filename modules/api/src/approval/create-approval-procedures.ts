// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import type { AnswerSettlement } from '@heynixie/proposals';
import { requireCaller } from '../memory/require-caller';
import { createPasskeyAnswerGate } from '../passkey/create-passkey-answer-gate';
import { buildProposalCoreDeps } from '../proposal/build-proposal-core-deps';
import type { ProposalParts } from '../proposal/build-proposal-core-deps';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { readApprovalItems } from './read-approval-items';
import { readApprovalProposals } from './read-approval-proposals';
import type { ApprovalAnswer, ApprovalRun } from './run-approval-answer';
import { runApprovalAnswer } from './run-approval-answer';
import { writeUnknownOutcomeAnswer } from './write-unknown-outcome-answer';

export function createApprovalProcedures(context: APIContext, parts: ProposalParts) {
  const approvals = apiImplementer.approvals;
  const deps = buildProposalCoreDeps(context, parts);

  return {
    listItems: approvals.listItems.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      return readApprovalItems(context, deps, parts.readMemory);
    }),

    readProposals: approvals.readProposals.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      return readApprovalProposals(context, deps, parts.readMemory, {
        caller,
        proposalIDs: options.input.proposalIDs,
      });
    }),

    answerProposal: approvals.answerProposal.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const run = await runApprovalAnswer(context, deps, caller, {
        answer: options.input,
        passkey: createPasskeyAnswerGate(context, { caller, assertion: options.input.passkey }),
      });

      if (run.status === 'unauthorized') {
        throw options.errors.UNAUTHORIZED();
      }

      if (run.status === 'passkey_refused') {
        throw {
          PASSKEY_REQUIRED: options.errors.PASSKEY_REQUIRED,
          NO_PASSKEY: options.errors.NO_PASSKEY,
          PASSKEY_FAILED: () =>
            options.errors.PASSKEY_FAILED({
              data: {
                reason: run.refusal.error === 'PASSKEY_FAILED' ? run.refusal.reason : 'signature',
              },
            }),
        }[run.refusal.error]();
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

    answerUnknownOutcome: approvals.answerUnknownOutcome.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const result = await writeUnknownOutcomeAnswer(context, caller, options.input);

      if (result.status === 'answered') {
        return { actionID: result.actionID, choice: result.choice };
      }

      if (result.status === 'passkey_refused') {
        throw {
          PASSKEY_REQUIRED: options.errors.PASSKEY_REQUIRED,
          NO_PASSKEY: options.errors.NO_PASSKEY,
          PASSKEY_FAILED: () =>
            options.errors.PASSKEY_FAILED({
              data: {
                reason:
                  result.refusal.error === 'PASSKEY_FAILED' ? result.refusal.reason : 'signature',
              },
            }),
        }[result.refusal.error]();
      }

      if (result.status === 'not_allowed') {
        throw options.errors.NOT_ALLOWED({ data: { reason: result.reason } });
      }

      throw {
        reused: options.errors.CLIENT_ACTION_ID_REUSED,
        unauthorized: options.errors.UNAUTHORIZED,
      }[result.status]();
    }),

    answerProposals: approvals.answerProposals.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const results = [];

      for (const answer of options.input.answers) {
        const run = await runApprovalAnswer(context, deps, caller, { answer, passkey: undefined });

        if (run.status === 'unauthorized') {
          throw options.errors.UNAUTHORIZED();
        }

        const result = toRunResult(answer, run);

        results.push(result);
      }

      return { results };
    }),
  };
}

function toRunResult(
  answer: ApprovalAnswer,
  run: Exclude<ApprovalRun, { status: 'unauthorized' }>,
) {
  if (run.status === 'reused') {
    return {
      proposalID: answer.proposalID,
      error: 'NOT_ALLOWED' as const,
      reason: 'client_action_id_reused',
    };
  }

  // a batch carries no assertion, so a passkey refusal is always PASSKEY_REQUIRED
  if (run.status === 'passkey_refused') {
    return { proposalID: answer.proposalID, error: 'PASSKEY_REQUIRED' as const };
  }

  return toBatchResult(answer, run.settlement);
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
