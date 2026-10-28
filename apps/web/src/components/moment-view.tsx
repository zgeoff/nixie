import { ORPCError } from '@orpc/client';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { formatMemoryDate } from '../format-memory-date';
import { css } from '../styled-system/css';
import type { MomentDetail } from '../types';
import { useMomentEdit } from '../use-moment-edit';
import { useNixieClient } from '../use-nixie-client';
import { MomentDestroyControl } from './moment-destroy-control';
import { MomentLinks } from './moment-links';
import { MomentNoteForm } from './moment-note-form';
import { MomentReflections } from './moment-reflections';
import { MomentSpan } from './moment-span';

export interface MomentViewProps {
  readonly momentID: string;
  readonly navigation?: ReactNode;

  readonly onDestroyed: () => void;
}

const layout = css({
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '4',
  paddingInline: '4',
});

const header = css({ alignItems: 'baseline', display: 'flex', justifyContent: 'space-between' });

export function MomentView(props: MomentViewProps): ReactNode {
  const nixie = useNixieClient();

  const moment = useQuery(
    nixie.queryUtils.memory.readMoment.queryOptions({ input: { momentID: props.momentID } }),
  );

  return (
    <main className={layout}>
      <header className={header}>
        <p className={css({ fontSize: 'sm' })}>Moment</p>
        {props.navigation}
      </header>
      {moment.isPending ? <p>Loading the moment…</p> : null}
      {moment.isError ? <p role="alert">This moment did not load. It may be gone.</p> : null}
      {moment.data === undefined || isMomentGone(moment.error) ? null : (
        <MomentDetails moment={moment.data} onDestroyed={props.onDestroyed} />
      )}
    </main>
  );
}

// A refetch that fails keeps the last data, so a moment destroyed elsewhere would still show.
function isMomentGone(error: unknown): boolean {
  return error instanceof ORPCError && error.code === 'MOMENT_NOT_FOUND';
}

interface MomentDetailsProps {
  readonly moment: MomentDetail;

  readonly onDestroyed: () => void;
}

const quiet = css({ color: 'textMuted', fontSize: 'sm' });

function MomentDetails(props: MomentDetailsProps): ReactNode {
  const moment = props.moment;

  return (
    <>
      <MomentTitle moment={moment} />
      <p className={quiet}>
        Kept {formatMemoryDate(moment.keptAt)} {moment.keptBy === 'model' ? 'by nixie' : 'by you'}
        {moment.editedAt === null ? null : ` · edited ${formatMemoryDate(moment.editedAt)}`}
        {moment.state === 'retired' ? ' · retired' : null}
      </p>
      <MomentNote moment={moment} />
      <MomentReflections moment={moment} />
      <MomentLinks moment={moment} />
      <MomentSpan momentID={moment.momentID} />
      <MomentEdges moment={moment} />
      <MomentDestroyControl
        momentID={moment.momentID}
        onDestroyed={props.onDestroyed}
        version={moment.version}
      />
    </>
  );
}

interface MomentPartProps {
  readonly moment: MomentDetail;
}

const row = css({ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '2' });
const field = css({ borderWidth: '1px', paddingInline: '2' });

function MomentTitle(props: MomentPartProps): ReactNode {
  const moment = props.moment;
  const [draft, setDraft] = useState<string | null>(null);

  const edit = useMomentEdit(moment.momentID, () => {
    setDraft(null);
  });

  if (draft === null) {
    return (
      <div className={row}>
        <h1 className={css({ fontSize: 'xl', fontWeight: 'bold' })}>
          {moment.title ?? 'Title unreadable'}
        </h1>
        {moment.titleBy === 'model' ? <span className={quiet}>(title by a model)</span> : null}
        <button
          onClick={() => {
            setDraft(moment.title ?? '');
          }}
          type="button"
        >
          Rename
        </button>
      </div>
    );
  }

  const title = draft.trim();

  return (
    <form
      className={row}
      onSubmit={(event) => {
        event.preventDefault();

        if (title !== '') {
          edit.send({ change: { kind: 'title', title }, version: moment.version });
        }
      }}
    >
      <label className={row}>
        Title
        <input
          className={field}
          maxLength={120}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          value={draft}
        />
      </label>
      <button disabled={title === '' || edit.isPending} type="submit">
        Save the title
      </button>
      <button
        onClick={() => {
          setDraft(null);
        }}
        type="button"
      >
        Cancel
      </button>
      {edit.notice === null ? null : <p role="alert">{edit.notice}</p>}
    </form>
  );
}

const section = css({ marginBlock: '4' });
const heading = css({ fontSize: 'lg', fontWeight: 'semibold' });

function MomentNote(props: MomentPartProps): ReactNode {
  const moment = props.moment;
  const note = moment.note;
  const [isWriting, setIsWriting] = useState(false);

  const stopWriting = (): void => {
    setIsWriting(false);
  };

  return (
    <section aria-label="Your note" className={section}>
      <h2 className={heading}>Your note</h2>
      {note === null ? null : (
        <>
          <p className={css({ whiteSpace: 'pre-wrap' })}>{note.text}</p>
          <p className={quiet}>Written {formatMemoryDate(note.writtenAt)}</p>
        </>
      )}
      {isWriting ? (
        <MomentNoteForm
          cancelLabel="Cancel"
          momentID={moment.momentID}
          note={note?.text ?? ''}
          onCancel={stopWriting}
          onSaved={stopWriting}
          version={moment.version}
        />
      ) : (
        <button
          onClick={() => {
            setIsWriting(true);
          }}
          type="button"
        >
          {note === null ? 'Add a note' : 'Edit the note'}
        </button>
      )}
    </section>
  );
}

function MomentEdges(props: MomentPartProps): ReactNode {
  const moment = props.moment;
  const [first, setFirst] = useState(String(moment.firstSequence));
  const [last, setLast] = useState(String(moment.lastSequence));
  const edit = useMomentEdit(moment.momentID);
  const firstSequence = Number(first);
  const lastSequence = Number(last);

  const isValid =
    /^\d+$/u.test(first.trim()) &&
    /^\d+$/u.test(last.trim()) &&
    Number.isSafeInteger(firstSequence) &&
    Number.isSafeInteger(lastSequence);

  return (
    <section aria-label="The span" className={section}>
      <h2 className={heading}>The span</h2>
      <p className={quiet}>
        The moment holds records {moment.firstSequence} to {moment.lastSequence} of its
        conversation. Move an edge to hold more or less of it.
      </p>
      <form
        className={row}
        onSubmit={(event) => {
          event.preventDefault();

          if (isValid) {
            edit.send({
              change: { kind: 'edges', firstSequence, lastSequence },
              version: moment.version,
            });
          }
        }}
      >
        <label className={row}>
          First record
          <input
            className={field}
            inputMode="numeric"
            onChange={(event) => {
              setFirst(event.target.value);
            }}
            value={first}
          />
        </label>
        <label className={row}>
          Last record
          <input
            className={field}
            inputMode="numeric"
            onChange={(event) => {
              setLast(event.target.value);
            }}
            value={last}
          />
        </label>
        <button disabled={!isValid || edit.isPending} type="submit">
          Move the edges
        </button>
      </form>
      {edit.notice === null ? null : <p role="alert">{edit.notice}</p>}
    </section>
  );
}
