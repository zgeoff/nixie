import type { ReactNode } from 'react';
import { useState } from 'react';
import { formatMemoryDate } from '../format-memory-date';
import { formatMemoryProvenance } from '../format-memory-provenance';
import { formatReviewReason } from '../format-review-reason';
import { css } from '../styled-system/css';
import type { MemoryProposal, ProposalOutcome } from '../types';
import type { ProposalAnswers } from '../use-proposal-answers';
import { SelfNoteBadge } from './self-note-badge';

export interface ProposalCardProps {
  readonly proposal: MemoryProposal;
  readonly answers: ProposalAnswers;
  readonly isSelected: boolean;
  readonly onSelect: (isSelected: boolean) => void;

  // your edited text while you edit the proposal, or null
  readonly draft: string | null;
  readonly onDraft: (draft: string | null) => void;
}

// One pending proposal: its text or your edit of it, a self-note's mark, why it waits for review,
// its quote inside the message it came from and when it lapses, and your answers to it. An
// approval an active item closely matches holds, and the card asks how to apply it.
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
      {props.draft === null ? (
        <p className={css({ whiteSpace: 'pre-wrap' })}>
          {proposal.operation === 'retire' ? `Retire: ${proposal.text}` : proposal.text}
        </p>
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
      <ProposalDetails proposal={proposal} />
      {shown?.status === 'close_match' ? (
        <CloseMatchChoice {...props} match={shown.item} />
      ) : (
        <ProposalControls {...props} />
      )}
    </li>
  );
}

const card = css({ borderBottomWidth: '1px', paddingBlock: '2' });
const meta = css({ color: 'textMuted', fontSize: 'sm' });
const field = css({ display: 'flex', flexDirection: 'column', fontSize: 'sm', gap: '1' });

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

// approve, with your edited text while you edit, edit, or reject with an optional reason
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

const controls = css({
  display: 'flex',
  flexWrap: 'wrap',
  fontSize: 'sm',
  gap: '2',
  marginTop: '1',
});

// a retirement adds no text, so it takes no edit
function EditToggle(props: ProposalCardProps): ReactNode {
  if (props.proposal.operation === 'retire') {
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

// an edit that leaves the text as proposed approves the proposal as it is
function buildEdit(proposal: MemoryProposal, draft: string | null) {
  return draft === null || draft === proposal.text ? {} : { editedText: draft };
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

interface CloseMatchChoiceProps extends ProposalCardProps {
  readonly match: Extract<ProposalOutcome, { status: 'close_match' }>['item'];
}

// the item that already says this, and the 2 ways an approval may still apply
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
