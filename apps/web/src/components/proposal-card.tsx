import type { ReactNode } from 'react';
import { useState } from 'react';
import { match } from 'ts-pattern';
import { formatMemoryDate } from '../format-memory-date';
import { formatMemoryProvenance } from '../format-memory-provenance';
import { formatReviewReason } from '../format-review-reason';
import { css } from '../styled-system/css';
import type { MemoryProposal, ProposalOutcome } from '../types';
import type { ProposalAnswers } from '../use-proposal-answers';
import { MessageImage } from './message-image';
import { SelfNoteBadge } from './self-note-badge';

export interface ProposalCardProps {
  readonly proposal: MemoryProposal;
  readonly answers: ProposalAnswers;
  readonly isSelected: boolean;
  readonly onSelect: (isSelected: boolean) => void;

  readonly draft: string | null;
  readonly onDraft: (draft: string | null) => void;
}

const card = css({ borderBottomWidth: '1px', paddingBlock: '2' });
const body = css({ alignItems: 'flex-start', display: 'flex', gap: '2' });
const meta = css({ color: 'textMuted', fontSize: 'sm' });
const field = css({ display: 'flex', flexDirection: 'column', fontSize: 'sm', gap: '1' });

export function ProposalCard(props: ProposalCardProps): ReactNode {
  const proposal = props.proposal;
  const shown = props.answers.outcomes[proposal.proposalID]?.outcome;

  return (
    <li aria-label={proposal.text} className={card}>
      <label className={meta}>
        <input
          checked={props.isSelected}
          onChange={(event) => {
            props.onSelect(event.target.checked);
          }}
          type="checkbox"
        />{' '}
        Select
      </label>
      <div className={body}>
        {proposal.image === null ? null : <MessageImage {...proposal.image} />}
        {props.draft === null ? (
          <p className={css({ whiteSpace: 'pre-wrap' })}>{formatProposalText(proposal)}</p>
        ) : (
          <label className={field}>
            Edited text
            <textarea
              onChange={(event) => {
                props.onDraft(event.target.value);
              }}
              value={props.draft}
            />
          </label>
        )}
      </div>
      <ProposalDetails proposal={proposal} />
      {shown?.status === 'close_match' ? (
        <CloseMatchChoice {...props} match={shown.item} />
      ) : (
        <ProposalControls {...props} />
      )}
    </li>
  );
}

function formatProposalText(proposal: MemoryProposal): string {
  return match(proposal.operation)
    .with('retire', () => `Retire: ${proposal.text}`)
    .with('pin', () => `Pin: ${proposal.text}`)
    .with('remember', () => proposal.text)
    .exhaustive();
}

interface ProposalDetailsProps {
  readonly proposal: MemoryProposal;
}

function ProposalDetails(props: ProposalDetailsProps): ReactNode {
  const proposal = props.proposal;
  const message = proposal.evidence?.message;

  return (
    <>
      <p className={meta}>
        {proposal.subject === 'self' ? <SelfNoteBadge /> : null}
        {formatReviewReason(proposal.reason)}
      </p>
      {proposal.until === null ? null : (
        <p className={meta}>Lasts until {formatMemoryDate(proposal.until)}</p>
      )}
      <p className={meta}>
        Proposed {formatMemoryProvenance(proposal.origin, proposal.source)} · lapses{' '}
        {formatMemoryDate(proposal.lapseAt)}
      </p>
      {proposal.quote === null ? (
        <p className={meta}>No quote from you.</p>
      ) : (
        <blockquote className={meta}>
          “{proposal.quote}”
          {message?.status === 'readable' ? ` from your message “${message.text ?? ''}”` : null}
        </blockquote>
      )}
    </>
  );
}

interface CloseMatchChoiceProps extends ProposalCardProps {
  readonly match: Extract<ProposalOutcome, { status: 'close_match' }>['item'];
}

const controls = css({
  display: 'flex',
  flexWrap: 'wrap',
  fontSize: 'sm',
  gap: '2',
  marginTop: '1',
});

function CloseMatchChoice(props: CloseMatchChoiceProps): ReactNode {
  const edit = buildEdit(props.proposal, props.draft);

  return (
    <div aria-label="An active item already says this" className={controls} role="group">
      <p className={meta}>An active item already says this: “{props.match.text}”</p>
      <button
        disabled={props.answers.isPending}
        onClick={() => {
          props.answers.approve([
            {
              proposal: props.proposal,
              ...edit,
              revisionOf: { itemID: props.match.itemID, version: props.match.version },
            },
          ]);
        }}
        type="button"
      >
        Revise that item
      </button>
      <button
        disabled={props.answers.isPending}
        onClick={() => {
          props.answers.approve([{ proposal: props.proposal, ...edit, ignoreCloseMatch: true }]);
        }}
        type="button"
      >
        Add as a new item
      </button>
    </div>
  );
}

function buildEdit(proposal: MemoryProposal, draft: string | null) {
  return draft === null || draft === proposal.text ? {} : { editedText: draft };
}

function ProposalControls(props: ProposalCardProps): ReactNode {
  const [reason, setReason] = useState<string | null>(null);
  const proposal = props.proposal;

  if (reason !== null) {
    return (
      <RejectionForm
        {...props}
        onCancel={() => {
          setReason(null);
        }}
        onReason={setReason}
        reason={reason}
      />
    );
  }

  return (
    <div className={controls}>
      <button
        disabled={props.answers.isPending}
        onClick={() => {
          props.answers.approve([{ proposal, ...buildEdit(proposal, props.draft) }]);
        }}
        type="button"
      >
        {props.draft === null ? 'Approve' : 'Approve edited text'}
      </button>
      <EditToggle {...props} />
      <button
        onClick={() => {
          setReason('');
        }}
        type="button"
      >
        Reject
      </button>
    </div>
  );
}

interface RejectionFormProps extends ProposalCardProps {
  readonly reason: string;
  readonly onReason: (reason: string) => void;
  readonly onCancel: () => void;
}

function RejectionForm(props: RejectionFormProps): ReactNode {
  const reason = props.reason.trim();

  return (
    <div aria-label="Reject this proposal" className={controls} role="group">
      <label className={field}>
        Reason (optional)
        <textarea
          maxLength={500}
          onChange={(event) => {
            props.onReason(event.target.value);
          }}
          value={props.reason}
        />
      </label>
      <button
        disabled={props.answers.isPending}
        onClick={() => {
          props.answers.reject([
            { proposal: props.proposal, ...(reason === '' ? {} : { reason }) },
          ]);
        }}
        type="button"
      >
        Reject
      </button>
      <button onClick={props.onCancel} type="button">
        Keep it
      </button>
    </div>
  );
}

function EditToggle(props: ProposalCardProps): ReactNode {
  if (props.proposal.operation !== 'remember') {
    return null;
  }

  return (
    <button
      onClick={() => {
        const draft = props.draft === null ? props.proposal.text : null;

        props.onDraft(draft);
      }}
      type="button"
    >
      {props.draft === null ? 'Edit' : 'Cancel edit'}
    </button>
  );
}
