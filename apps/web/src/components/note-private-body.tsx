import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';
import { NoteBody } from './note-body';
import { WordDiff } from './word-diff';

export interface OpenedNote {
  readonly body: string;
  readonly previousBody: string | null;
  readonly ownerOpenedAt: Date | null;
}

export interface NotePrivateBodyProps {
  readonly note: string;
  readonly version: number;
  readonly opened: OpenedNote | null;
  readonly onOpened: (opened: OpenedNote) => void;
}

const fold = css({
  alignItems: 'baseline',
  borderColor: 'border',
  borderStyle: 'dashed',
  borderWidth: '1px',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '3',
  padding: '3',
});

const muted = css({ color: 'textMuted', fontSize: 'sm' });
const diff = css({ fontSize: 'sm', whiteSpace: 'pre-wrap' });

// The body of a private note, folded until the user opens it. The open is a checked action: the
// action ID lasts as long as this component, so a retry after a failed call carries the same ID and
// never moves the mark twice.
export function NotePrivateBody(props: NotePrivateBodyProps): ReactNode {
  const nixie = useNixieClient();
  const [actionID] = useState(() => crypto.randomUUID());
  const onOpened = props.onOpened;

  const open = useMutation(
    nixie.queryUtils.notebook.openPrivate.mutationOptions({
      onSuccess: (result) => {
        onOpened(result);
      },
    }),
  );

  if (props.opened === null) {
    return (
      <div className={fold}>
        <p>The assistant marked this note private. Its body is folded.</p>
        <button
          disabled={open.isPending}
          name="open-private"
          onClick={() => {
            open.mutate({ clientActionID: actionID, note: props.note, version: props.version });
          }}
          type="button"
        >
          {open.isError ? 'Try again' : 'Open'}
        </button>
        {open.isError ? <p role="alert">The open did not finish. Try again.</p> : null}
      </div>
    );
  }

  return (
    <>
      {props.opened.ownerOpenedAt === null ? null : (
        <p className={muted}>Opened {props.opened.ownerOpenedAt.toLocaleString()}</p>
      )}
      <NoteBody text={props.opened.body} />
      {props.opened.previousBody === null ||
      props.opened.previousBody === props.opened.body ? null : (
        <section aria-label="Changes from the version before">
          <h3>Changes from the version before</h3>
          <p className={diff}>
            <WordDiff after={props.opened.body} before={props.opened.previousBody} />
          </p>
        </section>
      )}
    </>
  );
}
