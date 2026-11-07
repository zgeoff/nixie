import type { ContractOutputs } from '@heynixie/contract';
import { ORPCError } from '@orpc/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import { useNixieClient } from '../use-nixie-client';

type RuleAnswer =
  | { readonly answer: 'approve'; readonly proposalID: string }
  | { readonly answer: 'reject'; readonly proposalID: string; readonly reason: string };

export function RuleProposals(): ReactNode {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();
  const listed = useQuery(nixie.queryUtils.rules.listProposals.queryOptions());
  const proposals = listed.data?.proposals ?? [];

  const answer = useMutation({
    mutationFn: (call: RuleAnswer) =>
      call.answer === 'approve'
        ? nixie.client.rules.approveProposal({ proposalID: call.proposalID })
        : nixie.client.rules.rejectProposal({ proposalID: call.proposalID, reason: call.reason }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: nixie.queryUtils.rules.key() }),
  });

  return (
    <section aria-labelledby="rule-changes">
      <h2 className={css({ fontSize: 'lg', fontWeight: 'bold' })} id="rule-changes">
        Rule changes
      </h2>
      {listed.isError ? (
        <p role="alert">The rule changes did not load. Reload to try again.</p>
      ) : null}
      {answer.isError ? <p role="alert">{getAnswerNotice(answer.error)}</p> : null}
      {listed.isSuccess && proposals.length === 0 ? <p>No rule change waits for you.</p> : null}
      <ul aria-label="Pending rule changes">
        {proposals.map((proposal) => (
          <RuleProposalCard
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
  NOT_FOUND: 'That rule change is gone, so nothing changed.',
  PROPOSAL_CLOSED: 'That rule change is answered, withdrawn or lapsed, so nothing changed.',
};

function getAnswerNotice(error: unknown): string {
  const notice =
    error instanceof ORPCError && typeof error.code === 'string'
      ? answerNotices[error.code]
      : undefined;

  return notice ?? 'The answer did not finish. Try again.';
}

type RuleProposal = ContractOutputs['rules']['listProposals']['proposals'][number];

interface RuleProposalCardProps {
  readonly proposal: RuleProposal;
  readonly isPending: boolean;

  readonly onAnswer: (call: RuleAnswer) => void;
}

const card = css({ borderBottomWidth: '1px', paddingBlock: '2' });
const meta = css({ color: 'textMuted', fontSize: 'sm' });
const field = css({ display: 'flex', flexDirection: 'column', fontSize: 'sm', gap: '1' });
const controls = css({ display: 'flex', flexWrap: 'wrap', gap: '2', marginTop: '2' });

function RuleProposalCard(props: RuleProposalCardProps): ReactNode {
  const proposal = props.proposal;
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();

  return (
    <li aria-label={`Rule change ${proposal.proposalID}`} className={card}>
      <p>The definitions widen these rules, so they wait for your approval.</p>
      <ul>
        {proposal.changes.map((change) => (
          <li key={change.ruleID}>
            <strong>{change.ruleID}</strong>
            <p className={meta}>Now: {change.before?.sentence ?? 'No rule.'}</p>
            <p>After: {change.after?.sentence ?? 'The rule is removed.'}</p>
          </li>
        ))}
      </ul>
      <p className={meta}>
        Lapses{' '}
        {proposal.lapseAt.toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}
      </p>
      <div className={controls}>
        <button
          disabled={props.isPending}
          onClick={() => {
            props.onAnswer({ answer: 'approve', proposalID: proposal.proposalID });
          }}
          type="button"
        >
          Approve
        </button>
        <label className={field}>
          Reason to reject
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
          Reject
        </button>
      </div>
    </li>
  );
}
