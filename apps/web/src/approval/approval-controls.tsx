import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import type { ApprovalRead } from '../types';
import { ApprovalDeferMenu } from './approval-defer-menu';
import type { DeferSettings } from './build-defer-times';
import type { ApprovalAnswerer } from './use-approval-answer';

export interface ApprovalControlsProps {
  readonly item: ApprovalRead;
  readonly answerer: ApprovalAnswerer;
  readonly defer: DeferSettings;

  // false until a lifting proposal's rule bounds are on screen
  readonly isApprovable: boolean;

  // the text a memory edit asks for, or null
  readonly editedText: string | null;

  readonly isEditable: boolean;
  readonly isEditing: boolean;
  readonly onEditToggle: () => void;
}

const controls = css({
  alignItems: 'flex-start',
  display: 'flex',
  flexWrap: 'wrap',
  fontSize: 'sm',
  gap: '2',
  marginTop: '1',
});

const field = css({ display: 'flex', flexDirection: 'column', fontSize: 'sm', gap: '1' });

export function ApprovalControls(props: ApprovalControlsProps): ReactNode {
  const [note, setNote] = useState<string | null>(null);
  const item = props.item;
  const proposal = item.proposal;
  const choices = item.choices;
  const isBusy = props.answerer.isPending;
  const base = { proposalID: proposal.proposalID, actionHash: proposal.actionHash };
  const memory = props.editedText === null ? {} : { memory: { editedText: props.editedText } };

  if (note !== null) {
    const trimmed = note.trim();

    return (
      <div aria-label="Decline this proposal" className={controls} role="group">
        <label className={field}>
          Note (optional)
          <textarea
            maxLength={500}
            onChange={(event) => {
              setNote(event.target.value);
            }}
            value={note}
          />
        </label>
        <button
          disabled={isBusy}
          onClick={() => {
            props.answerer.send({
              ...base,
              choice: 'decline',
              ...(trimmed === '' ? {} : { note: trimmed }),
            });
          }}
          type="button"
        >
          Decline
        </button>
        <button
          onClick={() => {
            setNote(null);
          }}
          type="button"
        >
          Keep it
        </button>
      </div>
    );
  }

  return (
    <div className={controls}>
      {choices.includes('approve') ? (
        <button
          disabled={isBusy || !props.isApprovable}
          name="approve"
          onClick={() => {
            props.answerer.send({ ...base, choice: 'approve', ...memory });
          }}
          type="button"
        >
          {item.body?.approveLabel ?? 'Approve'}
        </button>
      ) : null}
      {choices.includes('always_allow') ? (
        <button
          disabled={isBusy || !props.isApprovable}
          name="always_allow"
          onClick={() => {
            props.answerer.send({
              ...base,
              choice: 'always_allow',
              ...(proposal.ruleHash === null ? {} : { ruleHash: proposal.ruleHash }),
            });
          }}
          type="button"
        >
          Always allow
        </button>
      ) : null}
      {props.isEditable ? (
        <button name="edit-text" onClick={props.onEditToggle} type="button">
          {props.isEditing ? 'Cancel edit' : 'Edit'}
        </button>
      ) : null}
      {choices.includes('defer') ? (
        <ApprovalDeferMenu
          isDisabled={isBusy}
          onDefer={(until, deferNote) => {
            props.answerer.send({
              ...base,
              choice: 'defer',
              deferUntil: until,
              ...(deferNote === null ? {} : { note: deferNote }),
            });
          }}
          settings={props.defer}
        />
      ) : null}
      {choices.includes('decline') ? (
        <button
          name="decline"
          onClick={() => {
            setNote('');
          }}
          type="button"
        >
          Decline
        </button>
      ) : null}
    </div>
  );
}
