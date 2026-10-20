import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { formatProposalOutcome } from '../format-proposal-outcome';
import { css } from '../styled-system/css';
import type { MemoryProposal } from '../types';
import { useNixieClient } from '../use-nixie-client';
import type { ProposalAnswers } from '../use-proposal-answers';
import { useProposalAnswers } from '../use-proposal-answers';
import { ProposalCard } from './proposal-card';
import { ProposalSelectionBar } from './proposal-selection-bar';

export interface MemoryProposalsProps {
  // the links to the app's other views, which the route supplies
  readonly navigation?: ReactNode;
}

const layout = css({
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '4',
  paddingInline: '4',
});

const header = css({ alignItems: 'baseline', display: 'flex', justifyContent: 'space-between' });

// Every pending memory proposal, to approve, edit and approve, or reject with a reason, one at a
// time or every selected one at once. An answer that met a lapsed or changed proposal shows what
// stopped it, and changed nothing.
export function MemoryProposals(props: MemoryProposalsProps): ReactNode {
  const nixie = useNixieClient();
  const listed = useQuery(nixie.queryUtils.memory.listProposals.queryOptions());
  const answers = useProposalAnswers();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({});
  const proposals = listed.data?.proposals ?? [];

  return (
    <main className={layout}>
      <header className={header}>
        <h1 className={css({ fontSize: 'xl', fontWeight: 'bold' })}>Memory proposals</h1>
        {props.navigation}
      </header>
      <AnswerNotices answers={answers} />
      {listed.isError ? <p role="alert">The proposals did not load. Reload to try again.</p> : null}
      <ProposalSelectionBar
        answers={answers}
        drafts={drafts}
        onSelect={setSelected}
        proposals={proposals}
        selected={selected}
      />
      {listed.isSuccess && proposals.length === 0 ? <p>No proposal waits for you.</p> : null}
      <ul aria-label="Pending proposals">
        {proposals.map((proposal) => (
          <ProposalCard
            key={proposal.proposalID}
            answers={answers}
            draft={drafts[proposal.proposalID] ?? null}
            isSelected={selected.has(proposal.proposalID)}
            onDraft={(draft) => {
              setDrafts((current) => updateEntry(current, proposal.proposalID, draft));
            }}
            onSelect={(isSelected) => {
              setSelected((current) => toggleEntry(current, proposal, isSelected));
            }}
            proposal={proposal}
          />
        ))}
      </ul>
    </main>
  );
}

interface AnswerNoticesProps {
  readonly answers: ProposalAnswers;
}

// what stopped each answer that changed nothing, by the proposal's text, since a stale proposal
// leaves the list; a failed call keeps its answers to send again
function AnswerNotices(props: AnswerNoticesProps): ReactNode {
  const notices = Object.entries(props.answers.outcomes).flatMap(([proposalID, shown]) => {
    const notice = formatProposalOutcome(shown.outcome);

    return notice === null || shown.outcome.status === 'close_match'
      ? []
      : [{ proposalID, text: `“${shown.text}”: ${notice}` }];
  });

  return (
    <>
      {props.answers.isError ? (
        <p role="alert">
          The answer did not finish.{' '}
          <button onClick={props.answers.retry} type="button">
            Try again
          </button>
        </p>
      ) : null}
      {notices.length === 0 ? null : (
        <ul aria-label="Answers that changed nothing" role="status">
          {notices.map((notice) => (
            <li key={notice.proposalID}>{notice.text}</li>
          ))}
        </ul>
      )}
    </>
  );
}

function updateEntry(
  current: Readonly<Record<string, string>>,
  proposalID: string,
  draft: string | null,
): Readonly<Record<string, string>> {
  const kept = Object.entries(current).filter(([key]) => key !== proposalID);

  const entries: readonly (readonly [string, string])[] =
    draft === null ? kept : [...kept, [proposalID, draft]];

  return Object.fromEntries(entries);
}

function toggleEntry(
  current: ReadonlySet<string>,
  proposal: MemoryProposal,
  isSelected: boolean,
): ReadonlySet<string> {
  const next = new Set(current);

  if (isSelected) {
    next.add(proposal.proposalID);
  } else {
    next.delete(proposal.proposalID);
  }

  return next;
}
