import type { ContractInputs } from '@heynixie/contract';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { MemoryProposal, NixieClient, ProposalOutcome, ReadonlyDeep } from './types';
import { useNixieClient } from './use-nixie-client';

// An approval of one proposal: as proposed, with your edited text, or after a close match as a
// revision of the item that matched or as a new item anyway.
interface ApprovalRequest {
  readonly proposal: MemoryProposal;
  readonly editedText?: string;
  readonly revisionOf?: { readonly itemID: string; readonly version: number };
  readonly ignoreCloseMatch?: boolean;
}

interface RejectionRequest {
  readonly proposal: MemoryProposal;
  readonly reason?: string;
}

// The last outcome of an answer that did not apply as asked, with the text of the proposal it
// answered, which a refreshed list may no longer hold.
interface ShownOutcome {
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
  readonly outcomes: Readonly<Record<string, ShownOutcome>>;
}

// one call's answers, with the text of each proposal they answer by its ID
type AnswerCall = ReadonlyDeep<
  { texts: Record<string, string> } & (
    | { kind: 'approve'; answers: ContractInputs['memory']['approveProposals']['answers'] }
    | { kind: 'reject'; answers: ContractInputs['memory']['rejectProposals']['answers'] }
  )
>;

// Your answers to pending proposals, one or several in one call, each its own checked action with
// a client action ID of its own. Every answer refreshes the memory view's lists.
export function useProposalAnswers(): ProposalAnswers {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();
  const [outcomes, setOutcomes] = useState<Readonly<Record<string, ShownOutcome>>>({});

  const answer = useMutation({
    mutationFn: (call: AnswerCall) => sendAnswers(nixie.client, call),
    onSuccess: (sent, call) => {
      setOutcomes((shown) => mergeOutcomes(shown, call.texts, sent));
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

// the most answers one call to the API takes, which the contract sets
const answersPerCall = 50;

// Sends the answers in calls of at most the contract's limit, one after another. A call that fails
// stops the rest, and a retry sends every answer again under its own client action ID, so each
// answer an earlier call committed returns its first outcome.
async function sendAnswers(
  client: NixieClient['client'],
  call: AnswerCall,
): Promise<readonly ProposalOutcome[]> {
  const outcomes: ProposalOutcome[] = [];

  for (let start = 0; start < call.answers.length; start += answersPerCall) {
    const sent = await (call.kind === 'approve'
      ? client.memory.approveProposals({
          answers: call.answers.slice(start, start + answersPerCall),
        })
      : client.memory.rejectProposals({
          answers: call.answers.slice(start, start + answersPerCall),
        }));

    outcomes.push(...sent.outcomes);
  }

  return outcomes;
}

// each answer keeps its own outcome; one that applied as asked clears what showed before
function mergeOutcomes(
  shown: Readonly<Record<string, ShownOutcome>>,
  texts: Readonly<Record<string, string>>,
  outcomes: readonly ProposalOutcome[],
): Readonly<Record<string, ShownOutcome>> {
  const answered = new Set(outcomes.map((outcome) => outcome.proposalID));

  const kept = Object.entries(shown).filter(([proposalID]) => !answered.has(proposalID));

  const held = outcomes
    .filter((outcome) => outcome.status !== 'applied' && outcome.status !== 'rejected')
    .map((outcome): readonly [string, ShownOutcome] => [
      outcome.proposalID,
      { text: texts[outcome.proposalID] ?? '', outcome },
    ]);

  return Object.fromEntries([...kept, ...held]);
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
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    requests.map((request) => [request.proposal.proposalID, request.proposal.text]),
  );
}
