import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import type { MemoryProposal } from '../types';
import type { ProposalAnswers } from '../use-proposal-answers';

export interface ProposalSelectionBarProps {
  readonly proposals: readonly MemoryProposal[];
  readonly answers: ProposalAnswers;

  // the IDs of the selected proposals, which may name proposals the list no longer holds
  readonly selected: ReadonlySet<string>;
  readonly onSelect: (selected: ReadonlySet<string>) => void;

  // your edited text of each proposal you edit, by its ID
  readonly drafts: Readonly<Record<string, string>>;
}

const bar = css({
  alignItems: 'end',
  display: 'flex',
  flexWrap: 'wrap',
  fontSize: 'sm',
  gap: '2',
  paddingBlock: '2',
});

// The answers to every selected proposal at once, each its own checked action: approve them, each
// with your edited text where you edited it, or reject them with one optional reason.
export function ProposalSelectionBar(props: ProposalSelectionBarProps): ReactNode {
  const [reason, setReason] = useState('');
  const chosen = props.proposals.filter((proposal) => props.selected.has(proposal.proposalID));
  const isIdle = chosen.length > 0 && !props.answers.isPending;

  if (props.proposals.length === 0) {
    return null;
  }

  return (
    <div aria-label="Selected proposals" className={bar} role="group">
      <SelectAll {...props} chosen={chosen.length} />
      <button
        disabled={!isIdle}
        onClick={() => {
          props.answers.approve(chosen.map((proposal) => buildApproval(proposal, props.drafts)));
          props.onSelect(new Set());
        }}
        type="button"
      >
        Approve selected
      </button>
      <label className={css({ display: 'flex', flexDirection: 'column', gap: '1' })}>
        Reason for rejecting (optional)
        <input
          maxLength={500}
          onChange={(event) => {
            setReason(event.target.value);
          }}
          value={reason}
        />
      </label>
      <button
        disabled={!isIdle}
        onClick={() => {
          const trimmed = reason.trim();

          props.answers.reject(
            chosen.map((proposal) =>
              trimmed === '' ? { proposal } : { proposal, reason: trimmed },
            ),
          );

          props.onSelect(new Set());

          setReason('');
        }}
        type="button"
      >
        Reject selected
      </button>
    </div>
  );
}

interface SelectAllProps extends ProposalSelectionBarProps {
  readonly chosen: number;
}

function SelectAll(props: SelectAllProps): ReactNode {
  const isAll = props.chosen === props.proposals.length;

  return (
    <label>
      <input
        checked={isAll}
        onChange={() => {
          const next = isAll ? [] : props.proposals.map((proposal) => proposal.proposalID);

          props.onSelect(new Set(next));
        }}
        type="checkbox"
      />{' '}
      Select all ({props.chosen} of {props.proposals.length})
    </label>
  );
}

// an edit that leaves the text as proposed approves the proposal as it is
function buildApproval(proposal: MemoryProposal, drafts: Readonly<Record<string, string>>) {
  const draft = drafts[proposal.proposalID];

  return draft === undefined || draft === proposal.text
    ? { proposal }
    : { proposal, editedText: draft };
}
