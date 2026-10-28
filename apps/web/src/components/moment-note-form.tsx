import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { useMomentDraft } from '../use-moment-draft';
import { useMomentEdit } from '../use-moment-edit';
import { MomentDraftConflict } from './moment-draft-conflict';

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
  const draft = useMomentDraft(props.note, props.version);
  const edit = useMomentEdit(props.momentID, props.onSaved);
  const note = draft.value.trim();

  return (
    <form
      className={form}
      onSubmit={(event) => {
        event.preventDefault();

        if (note !== '' && !draft.isOutdated) {
          edit.send({ change: { kind: 'note', note }, version: draft.baseVersion });
        }
      }}
    >
      <label className={css({ display: 'flex', flexDirection: 'column', gap: '1' })}>
        Why this moment matters, in your words
        <textarea
          className={field}
          maxLength={4000}
          onChange={(event) => {
            draft.change(event.target.value);
          }}
          value={draft.value}
        />
      </label>
      {draft.isOutdated ? (
        <MomentDraftConflict onKeepDraft={draft.keepDraft} onTakeLatest={draft.takeLatest} />
      ) : null}
      {edit.notice === null ? null : <p role="alert">{edit.notice}</p>}
      <div className={css({ display: 'flex', gap: '2' })}>
        <button disabled={note === '' || draft.isOutdated || edit.isPending} type="submit">
          Save the note
        </button>
        <button disabled={edit.isPending} onClick={props.onCancel} type="button">
          {props.cancelLabel}
        </button>
      </div>
    </form>
  );
}
