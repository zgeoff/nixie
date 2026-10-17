// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import type { ContractInputs } from '@heynixie/contract';
import type { ViewProposal } from '@heynixie/memory';
import { apiImplementer } from './api-implementer';
import { requireCaller } from './require-caller';
import { requireViewMemory } from './require-view-memory';
import type { APIContext, Identity, ReadViewMemory, ViewMemoryStore } from './types';
import type { ProposalAnswerAction, ProposalOutcome } from './write-proposal-answer';
import { writeProposalAnswer } from './write-proposal-answer';

// Builds the memory view's proposal procedures for a signed-in device: the pending proposals, and
// your approvals and rejections of one or several, each answer a checked action with you as the
// identity its approval or rejection record names.
export function buildMemoryProposalProcedures(context: APIContext, readMemory: ReadViewMemory) {
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

// What the view shows of a pending proposal, with its times as dates and its quote's place in the
// message it came from.
function toContractProposal(proposal: ViewProposal) {
  const evidence = proposal.evidence;

  return {
    proposalID: proposal.proposalID,
    operation: proposal.operation,
    itemID: proposal.itemID,
    targetVersion: proposal.targetVersion,
    isPinned: proposal.isPinned,
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
    evidence:
      evidence === null
        ? null
        : {
            sequence: evidence.recordSequence,
            start: evidence.start,
            end: evidence.end,
            message: evidence.message,
          },
  };
}

// Runs each answer in the order given, each its own checked action, so one stale or refused answer
// leaves the rest to go on. A session that ends partway stops the answers left and gives null; a
// retry with the same client action IDs gets each committed outcome back.
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

// An approval binds to the proposal, its hash and the close match answer, and to whether you edited
// the text, never to the text itself.
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

// A rejection binds to the proposal, its hash and whether you gave a reason, never to the reason.
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
