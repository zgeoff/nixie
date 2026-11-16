import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import type { DeferSettings } from './build-defer-times';
import { buildDeferTimes, isDeferBeforeDeadline, isDeferInRange } from './build-defer-times';

export interface ApprovalDeferMenuProps {
  readonly settings: DeferSettings;
  readonly isDisabled: boolean;

  // the action's deadline, after which no time is offered
  readonly deadlineAt?: Date | null;
  readonly onDefer: (until: Date, note: string | null) => void;
}

const menu = css({ display: 'flex', flexDirection: 'column', gap: '2', marginTop: '1' });
const options = css({ display: 'flex', flexWrap: 'wrap', gap: '2' });
const field = css({ display: 'flex', flexDirection: 'column', fontSize: 'sm', gap: '1' });

export function ApprovalDeferMenu(props: ApprovalDeferMenuProps): ReactNode {
  const [isOpen, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [custom, setCustom] = useState('');

  if (!isOpen) {
    return (
      <button
        name="defer"
        onClick={() => {
          setOpen(true);
        }}
        type="button"
      >
        Defer
      </button>
    );
  }

  const now = new Date();

  const times = buildDeferTimes(now, props.settings);
  const trimmed = note.trim();
  const customUntil = custom === '' ? null : new Date(custom);
  const deadlineAt = props.deadlineAt ?? null;
  const isOffered = (until: Date): boolean => isDeferBeforeDeadline(until, deadlineAt);

  const isCustomValid =
    customUntil !== null && isDeferInRange(now, customUntil) && isOffered(customUntil);

  const send = (until: Date): void => {
    const sentNote = trimmed === '' ? null : trimmed;

    props.onDefer(until, sentNote);
  };

  return (
    <div aria-label="Defer this proposal" className={menu} role="group">
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
      <div className={options}>
        {isOffered(times.inDefaultMinutes) ? (
          <button
            disabled={props.isDisabled}
            name="defer-default"
            onClick={() => {
              send(times.inDefaultMinutes);
            }}
            type="button"
          >
            {formatDefaultLabel(props.settings.defaultMinutes)}
          </button>
        ) : null}
        {isOffered(times.thisEvening) ? (
          <button
            disabled={props.isDisabled}
            onClick={() => {
              send(times.thisEvening);
            }}
            type="button"
          >
            This evening
          </button>
        ) : null}
        {isOffered(times.tomorrowMorning) ? (
          <button
            disabled={props.isDisabled}
            onClick={() => {
              send(times.tomorrowMorning);
            }}
            type="button"
          >
            Tomorrow morning
          </button>
        ) : null}
      </div>
      <div className={options}>
        <label className={field}>
          Custom time
          <input
            onChange={(event) => {
              setCustom(event.target.value);
            }}
            type="datetime-local"
            value={custom}
          />
        </label>
        <button
          disabled={props.isDisabled || !isCustomValid}
          onClick={() => {
            if (customUntil !== null) {
              send(customUntil);
            }
          }}
          type="button"
        >
          Defer until then
        </button>
        <button
          onClick={() => {
            setOpen(false);
          }}
          type="button"
        >
          Cancel
        </button>
      </div>
      {custom !== '' && !isCustomValid ? (
        <p role="alert">Pick a time from 1 minute to 30 days ahead, before any deadline.</p>
      ) : null}
    </div>
  );
}

function formatDefaultLabel(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;

    return hours === 1 ? 'In 1 hour' : `In ${String(hours)} hours`;
  }

  return `In ${String(minutes)} minutes`;
}
