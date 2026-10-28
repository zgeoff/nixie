import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import { useMomentEdit } from '../use-moment-edit';

export interface MomentNoteFormProps {
  readonly momentID: string;
  readonly version: number;
  readonly note: string;

  readonly onSaved: () => void;
  readonly onCancel: () => void;
  readonly cancelLabel: string;
}

const form = css({ display: 'flex', flexDirection: 'column', gap: '2', marginBlock: '2' });
const field = css({ borderWidth: '1px', minHeight: '20', padding: '2' });

export function MomentNoteForm(props: MomentNoteFormProps): ReactNode {
  const [text, setText] = useState(props.note);
  const edit = useMomentEdit(props.momentID, props.onSaved);
  const note = text.trim();
  const version = props.version;

  return (
    <form
      className={form}
      onSubmit={(event) => {
        event.preventDefault();

        if (note !== '') {
          edit.send({ change: { kind: 'note', note }, version });
        }
      }}
    >
      <label className={css({ display: 'flex', flexDirection: 'column', gap: '1' })}>
        Why this moment matters, in your words
        <textarea
          className={field}
          maxLength={4000}
          onChange={(event) => {
            setText(event.target.value);
          }}
          value={text}
        />
      </label>
      {edit.notice === null ? null : <p role="alert">{edit.notice}</p>}
      <div className={css({ display: 'flex', gap: '2' })}>
        <button disabled={note === '' || edit.isPending} type="submit">
          Save the note
        </button>
        <button disabled={edit.isPending} onClick={props.onCancel} type="button">
          {props.cancelLabel}
        </button>
      </div>
    </form>
  );
}
