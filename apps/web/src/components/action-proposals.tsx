import type { ContractOutputs } from '@heynixie/contract';
import { ORPCError } from '@orpc/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import { useNixieClient } from '../use-nixie-client';

type ActionAnswer =
  | { readonly answer: 'approve'; readonly proposalID: string }
  | { readonly answer: 'reject'; readonly proposalID: string; readonly reason: string };

export function ActionProposals(): ReactNode {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();
  const listed = useQuery(nixie.queryUtils.rules.listActionProposals.queryOptions());
  const proposals = listed.data?.proposals ?? [];

  const answer = useMutation({
    mutationFn: (call: ActionAnswer) =>
      call.answer === 'approve'
        ? nixie.client.rules.approveActionProposal({ proposalID: call.proposalID })
        : nixie.client.rules.rejectActionProposal({
            proposalID: call.proposalID,
            reason: call.reason,
          }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: nixie.queryUtils.rules.key() }),
  });

  return (
    <section aria-labelledby="action-requests">
      <h2 className={css({ fontSize: 'lg', fontWeight: 'bold' })} id="action-requests">
        Actions waiting for you
      </h2>
      {listed.isError ? <p role="alert">The actions did not load. Reload to try again.</p> : null}
      {answer.isError ? <p role="alert">{getAnswerNotice(answer.error)}</p> : null}
      {listed.isSuccess && proposals.length === 0 ? <p>No action waits for you.</p> : null}
      <ul aria-label="Pending actions">
        {proposals.map((proposal) => (
          <ActionProposalCard
            key={proposal.proposalID}
            isPending={answer.isPending}
            onAnswer={(call) => {
              answer.mutate(call);
            }}
            proposal={proposal}
          />
        ))}
      </ul>
    </section>
  );
}

const answerNotices: Readonly<Record<string, string>> = {
  NOT_FOUND: 'That action is gone, so nothing changed.',
  PROPOSAL_CLOSED: 'That action is answered or lapsed, so nothing changed.',
};

function getAnswerNotice(error: unknown): string {
  const notice =
    error instanceof ORPCError && typeof error.code === 'string'
      ? answerNotices[error.code]
      : undefined;

  return notice ?? 'The answer did not finish. Try again.';
}

type ActionProposal = ContractOutputs['rules']['listActionProposals']['proposals'][number];

interface ActionProposalCardProps {
  readonly proposal: ActionProposal;
  readonly isPending: boolean;

  readonly onAnswer: (call: ActionAnswer) => void;
}

const card = css({ borderBottomWidth: '1px', paddingBlock: '2' });
const meta = css({ color: 'textMuted', fontSize: 'sm' });
const field = css({ display: 'flex', flexDirection: 'column', fontSize: 'sm', gap: '1' });
const controls = css({ display: 'flex', flexWrap: 'wrap', gap: '2', marginTop: '2' });

function ActionProposalCard(props: ActionProposalCardProps): ReactNode {
  const proposal = props.proposal;
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();

  return (
    <li aria-label={`Action ${proposal.proposalID}`} className={card}>
      <p>{proposal.sentence}</p>
      <p className={meta}>
        Lapses{' '}
        {proposal.lapseAt.toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}
        . Approving it records your answer. nixie runs approved actions in a later release.
      </p>
      <div className={controls}>
        <button
          disabled={props.isPending}
          onClick={() => {
            props.onAnswer({ answer: 'approve', proposalID: proposal.proposalID });
          }}
          type="button"
        >
          Approve action
        </button>
        <label className={field}>
          Reason to decline
          <textarea
            maxLength={500}
            onChange={(event) => {
              setReason(event.target.value);
            }}
            value={reason}
          />
        </label>
        <button
          disabled={props.isPending || trimmed === ''}
          onClick={() => {
            props.onAnswer({ answer: 'reject', proposalID: proposal.proposalID, reason: trimmed });
          }}
          type="button"
        >
          Decline action
        </button>
      </div>
    </li>
  );
}
