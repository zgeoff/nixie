// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import type { ContractInputs } from '@heynixie/contract';
import type { ViewProposal } from '@heynixie/memory';
import { apiImplementer } from './api-implementer';
import { requireCaller } from './require-caller';
import { requireViewMemory } from './require-view-memory';
import { toContractImage } from './to-contract-image';
import { toContractKind } from './to-contract-kind';
import type { APIContext, Identity, ReadViewMemory, ViewMemoryStore } from './types';
import type { ProposalAnswerAction, ProposalOutcome } from './write-proposal-answer';
import { writeProposalAnswer } from './write-proposal-answer';

export function createMemoryProposalProcedures(context: APIContext, readMemory: ReadViewMemory) {
  const memory = apiImplementer.memory;

  return {
    listProposals: memory.listProposals.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const store = requireViewMemory(readMemory, options.errors.MEMORY_NOT_STARTED);

      const proposals = await store.view.readProposals();

      return { proposals: proposals.map((proposal) => toContractProposal(proposal)) };
    }),

    approveProposals: memory.approveProposals.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const store = requireViewMemory(readMemory, options.errors.MEMORY_NOT_STARTED);

      const outcomes = await runAnswers(
        context,
        caller,
        options.input.answers.map((answer) => buildApprovalAction(store, caller, answer)),
      );

      if (outcomes === null) {
        throw options.errors.UNAUTHORIZED();
      }

      return { outcomes };
    }),

    rejectProposals: memory.rejectProposals.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const store = requireViewMemory(readMemory, options.errors.MEMORY_NOT_STARTED);

      const outcomes = await runAnswers(
        context,
        caller,
        options.input.answers.map((answer) => buildRejectionAction(store, caller, answer)),
      );

      if (outcomes === null) {
        throw options.errors.UNAUTHORIZED();
      }

      return { outcomes };
    }),
  };
}

function toContractProposal(proposal: ViewProposal) {
  const evidence = proposal.evidence;

  return {
    proposalID: proposal.proposalID,
    operation: proposal.operation,
    itemID: proposal.itemID,
    targetVersion: proposal.targetVersion,
    isPinned: proposal.isPinned,
    isSensitive: proposal.isSensitive,
    kind: toContractKind(proposal.subject),
    subject: proposal.subject,
    reason: proposal.reason,
    actionHash: proposal.actionHash,
    origin: proposal.origin,
    source: proposal.source,
    createdAt: new Date(proposal.createdAt),
    lapseAt: new Date(proposal.lapseAt),
    sources: proposal.sources.map((source) => ({
      origin: source.origin,
      thread: source.thread,
      proposedAt: new Date(source.proposedAt),
    })),
    text: proposal.text,
    quote: proposal.quote,
    until: proposal.until === null ? null : new Date(proposal.until),
    evidence:
      evidence === null
        ? null
        : {
            sequence: evidence.recordSequence,
            start: evidence.start,
            end: evidence.end,
            message: evidence.message,
          },

    image: toContractImage(proposal.image),
  };
}

async function runAnswers(
  context: APIContext,
  caller: Identity,
  actions: readonly ProposalAnswerAction[],
): Promise<ProposalOutcome[] | null> {
  const outcomes: ProposalOutcome[] = [];

  for (const action of actions) {
    const outcome = await writeProposalAnswer(context, caller, action);

    if (outcome === null) {
      return null;
    }

    outcomes.push(outcome);
  }

  return outcomes;
}

type ApprovalAnswer = ContractInputs['memory']['approveProposals']['answers'][number];

function buildApprovalAction(
  store: ViewMemoryStore,
  caller: Identity,
  answer: ApprovalAnswer,
): ProposalAnswerAction {
  const binding = {
    proposalID: answer.proposalID,
    actionHash: answer.actionHash,
    ...(answer.revisionOf === undefined ? {} : { revisionOf: answer.revisionOf }),
    ...(answer.ignoreCloseMatch === undefined ? {} : { ignoreCloseMatch: answer.ignoreCloseMatch }),
  };

  return {
    clientActionID: answer.clientActionID,
    procedure: 'memory.approveProposals',
    proposalID: answer.proposalID,
    input: { ...binding, isEdited: answer.editedText !== undefined },
    committed: { proposalID: answer.proposalID, status: 'applied' },
    apply: async (writeInTransaction) => {
      const result = await store.proposals.approve({
        ...binding,
        ...(answer.editedText === undefined ? {} : { editedText: answer.editedText }),
        identityID: caller.identityID,
        writeInTransaction,
      });

      return result.status === 'close_match'
        ? { proposalID: answer.proposalID, status: 'close_match', item: result.item }
        : null;
    },
  };
}

type RejectionAnswer = ContractInputs['memory']['rejectProposals']['answers'][number];

function buildRejectionAction(
  store: ViewMemoryStore,
  caller: Identity,
  answer: RejectionAnswer,
): ProposalAnswerAction {
  return {
    clientActionID: answer.clientActionID,
    procedure: 'memory.rejectProposals',
    proposalID: answer.proposalID,
    input: {
      proposalID: answer.proposalID,
      actionHash: answer.actionHash,
      hasReason: answer.reason !== undefined,
    },
    committed: { proposalID: answer.proposalID, status: 'rejected' },
    apply: async (writeInTransaction) => {
      await store.proposals.reject({
        proposalID: answer.proposalID,
        actionHash: answer.actionHash,
        ...(answer.reason === undefined ? {} : { reason: answer.reason }),
        identityID: caller.identityID,
        writeInTransaction,
      });

      return null;
    },
  };
}
