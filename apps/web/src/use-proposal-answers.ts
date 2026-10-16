import type { ContractInputs } from '@heynixie/contract';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { MemoryProposal, ProposalOutcome } from './types';
import { useNixieClient } from './use-nixie-client';

// An approval of one proposal: as proposed, with your edited text, or after a close match as a
// revision of the item that matched or as a new item anyway.
export interface ApprovalRequest {
  readonly proposal: MemoryProposal;
  readonly editedText?: string;
  readonly revisionOf?: { readonly itemID: string; readonly version: number };
  readonly ignoreCloseMatch?: boolean;
}

export interface RejectionRequest {
  readonly proposal: MemoryProposal;
  readonly reason?: string;
}

// The last outcome of an answer that did not apply as asked, with the text of the proposal it
// answered, which a refreshed list may no longer hold.
export interface ShownOutcome {
  readonly text: string;
  readonly outcome: ProposalOutcome;
}

export interface ProposalAnswers {
  readonly approve: (requests: readonly ApprovalRequest[]) => void;
  readonly reject: (requests: readonly RejectionRequest[]) => void;

  // sends the last answers again with the same client action IDs, so each applies once
  readonly retry: () => void;
  readonly isPending: boolean;
  readonly isError: boolean;

  // by proposal ID
  readonly outcomes: ReadonlyMap<string, ShownOutcome>;
}

// one call's answers, with the text of each proposal they answer by its ID
type AnswerCall = { readonly texts: ReadonlyMap<string, string> } & (
  | {
      readonly kind: 'approve';
      readonly answers: ContractInputs['memory']['approveProposals']['answers'];
    }
  | {
      readonly kind: 'reject';
      readonly answers: ContractInputs['memory']['rejectProposals']['answers'];
    }
);

// Your answers to pending proposals, one or several in one call, each its own checked action with
// a client action ID of its own. Every answer refreshes the memory view's lists.
export function useProposalAnswers(): ProposalAnswers {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();
  const [outcomes, setOutcomes] = useState<ReadonlyMap<string, ShownOutcome>>(new Map());

  const answer = useMutation({
    mutationFn: (call: AnswerCall) =>
      call.kind === 'approve'
        ? nixie.client.memory.approveProposals({ answers: call.answers })
        : nixie.client.memory.rejectProposals({ answers: call.answers }),
    onSuccess: (result, call) => {
      setOutcomes((shown) => mergeOutcomes(shown, call.texts, result.outcomes));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: nixie.queryUtils.memory.key() }),
  });

  return {
    approve: (requests) => {
      answer.mutate(buildApprovalCall(requests));
    },
    reject: (requests) => {
      answer.mutate(buildRejectionCall(requests));
    },
    retry: () => {
      if (answer.variables !== undefined) {
        answer.mutate(answer.variables);
      }
    },
    isPending: answer.isPending,
    isError: answer.isError,
    outcomes,
  };
}

// each answer keeps its own outcome; one that applied as asked clears what showed before
function mergeOutcomes(
  shown: ReadonlyMap<string, ShownOutcome>,
  texts: ReadonlyMap<string, string>,
  outcomes: readonly ProposalOutcome[],
): ReadonlyMap<string, ShownOutcome> {
  const merged = new Map(shown);

  for (const outcome of outcomes) {
    if (outcome.status === 'applied' || outcome.status === 'rejected') {
      merged.delete(outcome.proposalID);
    } else {
      merged.set(outcome.proposalID, { text: texts.get(outcome.proposalID) ?? '', outcome });
    }
  }

  return merged;
}

function buildApprovalCall(requests: readonly ApprovalRequest[]): AnswerCall {
  return {
    kind: 'approve',
    texts: buildTexts(requests),
    answers: requests.map((request) => ({
      clientActionID: crypto.randomUUID(),
      proposalID: request.proposal.proposalID,
      actionHash: request.proposal.actionHash,
      ...(request.editedText === undefined ? {} : { editedText: request.editedText }),
      ...(request.revisionOf === undefined ? {} : { revisionOf: request.revisionOf }),
      ...(request.ignoreCloseMatch === undefined
        ? {}
        : { ignoreCloseMatch: request.ignoreCloseMatch }),
    })),
  };
}

function buildRejectionCall(requests: readonly RejectionRequest[]): AnswerCall {
  return {
    kind: 'reject',
    texts: buildTexts(requests),
    answers: requests.map((request) => ({
      clientActionID: crypto.randomUUID(),
      proposalID: request.proposal.proposalID,
      actionHash: request.proposal.actionHash,
      ...(request.reason === undefined ? {} : { reason: request.reason }),
    })),
  };
}

function buildTexts(
  requests: readonly { readonly proposal: MemoryProposal }[],
): ReadonlyMap<string, string> {
  return new Map(requests.map((request) => [request.proposal.proposalID, request.proposal.text]));
}
