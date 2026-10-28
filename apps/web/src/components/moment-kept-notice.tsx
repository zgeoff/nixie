import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import type { LiveRecord } from '../use-live-records';
import { useNixieClient } from '../use-nixie-client';
import { useNoteOffer } from '../use-note-offer';
import { MomentNoteForm } from './moment-note-form';

export interface MomentKeptNoticeProps {
  readonly moment: NonNullable<LiveRecord['moment']>;
}

const quiet = css({ color: 'textMuted', fontSize: 'sm' });
const link = css({ color: 'link', textDecoration: 'underline' });

export function MomentKeptNotice(props: MomentKeptNoticeProps): ReactNode {
  const moment = props.moment;
  const title = moment.title ?? 'its title is gone';

  return (
    <li aria-label={`Kept a moment: ${title}`} className={quiet}>
      <span>Kept a moment: {title}</span>
      {' · '}
      <a className={link} href={`/moments/${moment.momentID}`}>
        Open
      </a>
      <NoteOffer momentID={moment.momentID} />
    </li>
  );
}

interface NoteOfferProps {
  readonly momentID: string;
}

function NoteOffer(props: NoteOfferProps): ReactNode {
  const offer = useNoteOffer(props.momentID);
  const [stage, setStage] = useState<'offered' | 'writing' | 'saved'>('offered');
  const notice = offer.notice === null ? null : <p role="alert">{offer.notice}</p>;

  if (stage === 'saved') {
    return (
      <>
        <p role="status">Note added.</p>
        {notice}
      </>
    );
  }

  if (!offer.isOpen) {
    return notice;
  }

  if (stage === 'writing') {
    return (
      <NoteWriter
        momentID={props.momentID}
        onCancel={offer.close}
        onSaved={() => {
          setStage('saved');

          offer.close();
        }}
      />
    );
  }

  return (
    <div aria-label="Add a note" className={css({ display: 'flex', gap: '2' })} role="group">
      <button
        onClick={() => {
          setStage('writing');
        }}
        type="button"
      >
        Add a note
      </button>
      <button onClick={offer.close} type="button">
        Skip
      </button>
    </div>
  );
}

interface NoteWriterProps {
  readonly momentID: string;

  readonly onSaved: () => void;
  readonly onCancel: () => void;
}

function NoteWriter(props: NoteWriterProps): ReactNode {
  const nixie = useNixieClient();

  const moment = useQuery(
    nixie.queryUtils.memory.readMoment.queryOptions({ input: { momentID: props.momentID } }),
  );

  if (moment.isError) {
    return <p role="alert">This moment did not load. It may be gone.</p>;
  }

  // A form mounted before the moment loads starts from no note, and a save would replace the note.
  if (moment.data === undefined) {
    return <p>Loading the moment…</p>;
  }

  return (
    <MomentNoteForm
      cancelLabel="Skip"
      momentID={props.momentID}
      note={moment.data.note?.text ?? ''}
      onCancel={props.onCancel}
      onSaved={props.onSaved}
      version={moment.data.version}
    />
  );
}
