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

  // a proposed rule, whose Decline is Not now and takes no note
  readonly isRuleProposal: boolean;
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

const placeList = css({
  border: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: '1',
  margin: '0',
  padding: '0',
});

const field = css({ display: 'flex', flexDirection: 'column', fontSize: 'sm', gap: '1' });

export function ApprovalControls(props: ApprovalControlsProps): ReactNode {
  const [note, setNote] = useState<string | null>(null);
  const [unticked, setUnticked] = useState<readonly number[]>([]);
  const item = props.item;
  const proposal = item.proposal;
  const choices = item.choices;
  const isBusy = props.answerer.isPending;
  const base = { proposalID: proposal.proposalID, actionHash: proposal.actionHash };
  const memory = props.editedText === null ? {} : { memory: { editedText: props.editedText } };
  const places = item.body?.places;
  const place = item.body?.place;

  const tickedPlaces =
    places === undefined || unticked.length === 0
      ? {}
      : {
          tickedPlaces: places.flatMap((_line, index) => (unticked.includes(index) ? [] : [index])),
        };

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
      {places === undefined ? null : (
        <fieldset aria-label="Places to trust" className={placeList}>
          {places.map((line, index) => (
            <label key={line.words}>
              <input
                checked={!unticked.includes(index)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? unticked.filter((entry) => entry !== index)
                    : [...unticked, index];

                  setUnticked(next);
                }}
                type="checkbox"
              />{' '}
              {line.words}, to {line.trust}: {line.why}
            </label>
          ))}
        </fieldset>
      )}
      {choices.includes('approve') ? (
        <button
          disabled={isBusy || !props.isApprovable}
          name="approve"
          onClick={() => {
            props.answerer.send({ ...base, choice: 'approve', ...memory, ...tickedPlaces });
          }}
          type="button"
        >
          {item.body?.approveLabel ?? 'Approve'}
        </button>
      ) : null}
      {place !== undefined && choices.includes('approve') ? (
        <>
          <span>The place these answers trust: {place.words}</span>
          <button
            disabled={isBusy || !props.isApprovable}
            name="trust-read"
            onClick={() => {
              props.answerer.send({
                ...base,
                choice: 'approve',
                trust: 'read',
                placeHash: place.readHash,
              });
            }}
            type="button"
          >
            Trust this place to read
          </button>
          <button
            disabled={isBusy || !props.isApprovable}
            name="trust-act"
            onClick={() => {
              props.answerer.send({
                ...base,
                choice: 'approve',
                trust: 'act',
                placeHash: place.actHash,
              });
            }}
            type="button"
          >
            Trust this place to act
          </button>
        </>
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
          deadlineAt={props.item.proposal.deadlineAt}
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
      {choices.includes('decline') && props.isRuleProposal ? (
        <button
          disabled={isBusy}
          name="decline"
          onClick={() => {
            props.answerer.send({ ...base, choice: 'decline' });
          }}
          type="button"
        >
          Not now
        </button>
      ) : null}
      {choices.includes('decline') && !props.isRuleProposal ? (
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
