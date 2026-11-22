import { ORPCError } from '@orpc/client';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import type { ForgetBackup } from '../types';
import { isUnauthorizedError } from '../utils/is-unauthorized-error';
import { useNixieClient } from '../utils/use-nixie-client';
import { EnrolForm } from './enrol-form';
import { ForgetBackupLine } from './forget-backup-line';
import { NoteBody } from './note-body';
import { NoteForgetControl } from './note-forget-control';
import { NoteHistory } from './note-history';
import { NoteLinks } from './note-links';
import type { OpenedNote } from './note-private-body';
import { NotePrivateBody } from './note-private-body';

export interface NoteViewProps {
  readonly note: string;

  // the version to show, or undefined for the current one
  readonly version: number | undefined;
  readonly showPrivate: boolean;
  readonly onShowPrivate: () => void;
}

const page = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '4',
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '4',
  paddingInline: '4',
});

const muted = css({ color: 'textMuted', fontSize: 'sm' });
const link = css({ color: 'link', textDecoration: 'underline' });

interface OpenedVersion extends OpenedNote {
  readonly version: number;
}

// One note, read-only. Forget is the one control that changes it. A private note shows its title,
// links and marks, with its body folded until the user opens it, and with the toggle off it shows
// only that it is private.
export function NoteView(props: NoteViewProps): ReactNode {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();
  const [forgotten, setForgotten] = useState<ForgetBackup | null>(null);
  const [opened, setOpened] = useState<OpenedVersion | null>(null);

  const read = useInfiniteQuery({
    ...nixie.queryUtils.notebook.readNote.infiniteOptions({
      input: (historyAfter: string | undefined) => ({
        note: props.note,
        ...(props.version === undefined ? {} : { version: props.version }),
        ...(props.showPrivate ? { showPrivate: true } : {}),
        ...(historyAfter === undefined ? {} : { historyAfter }),
      }),
      initialPageParam: undefined,
      getNextPageParam: (lastPage) =>
        'historyNext' in lastPage ? (lastPage.historyNext ?? undefined) : undefined,
      retry: false,
    }),
    enabled: forgotten === null,
  });

  const search = props.showPrivate ? { private: 1 as const } : {};

  const back = (
    <Link className={link} search={search} to="/notebook">
      All notes
    </Link>
  );

  if (forgotten !== null) {
    return (
      <main className={page}>
        {back}
        <p>The note is forgotten.</p>
        <ForgetBackupLine backup={forgotten} />
      </main>
    );
  }

  if (isUnauthorizedError(read.error)) {
    return (
      <EnrolForm
        onEnrolled={() => {
          void queryClient.resetQueries({ queryKey: nixie.queryUtils.notebook.key() });
        }}
      />
    );
  }

  const first = read.data?.pages[0];

  if (first === undefined) {
    return (
      <main className={page}>
        {back}
        {read.isPending ? <p className={muted}>Loading the note…</p> : null}
        {read.isError ? <p role="alert">{formatReadError(read.error)}</p> : null}
      </main>
    );
  }

  if (!('title' in first)) {
    return (
      <main className={page}>
        {back}
        <h1>This note is private</h1>
        <p>The assistant marked it private. Turn on Show private to see it here.</p>
        <button onClick={props.onShowPrivate} type="button">
          Show private
        </button>
        <NoteForgetControl note={props.note} onForgotten={setForgotten} />
      </main>
    );
  }

  const history = (read.data?.pages ?? []).flatMap((loaded) =>
    'history' in loaded ? loaded.history : [],
  );

  const openedHere = opened?.version === first.version ? opened : null;
  const isHidden = first.isPrivate && openedHere === null;

  return (
    <main className={page}>
      {back}
      <header>
        <h1>{first.title}</h1>
        <p className={muted}>
          Version {first.version} of {first.versionCount}
          {first.isPrivate ? ' · Private' : ''}
        </p>
        {first.tags.length === 0 ? null : <p className={muted}>Tags: {first.tags.join(', ')}</p>}
        <p className={muted}>
          {first.readAt === null
            ? 'The assistant has not read it.'
            : `The assistant last read it ${first.readAt.toLocaleString()}.`}
          {first.ownerOpenedAt === null || !first.isPrivate
            ? ''
            : ` You last opened it ${first.ownerOpenedAt.toLocaleString()}.`}
        </p>
      </header>
      {first.isPrivate ? (
        <NotePrivateBody
          key={first.version}
          note={first.note}
          onOpened={(result) => {
            setOpened({ ...result, version: first.version });
          }}
          opened={openedHere}
          version={first.version}
        />
      ) : (
        <NoteBody text={first.body ?? ''} />
      )}
      <NoteLinks backlinks={first.backlinks} links={first.links} showPrivate={props.showPrivate} />
      {isHidden ? null : (
        <NoteHistory
          currentVersion={first.version}
          hasMore={read.hasNextPage}
          history={history}
          isLoadingMore={read.isFetchingNextPage}
          note={first.note}
          onLoadMore={() => {
            void read.fetchNextPage();
          }}
          showPrivate={props.showPrivate}
        />
      )}
      <NoteForgetControl note={first.note} onForgotten={setForgotten} />
    </main>
  );
}

function formatReadError(error: unknown): string {
  return error instanceof ORPCError && error.code === 'UNKNOWN_NOTE'
    ? 'No note has this ID. It may be forgotten.'
    : 'The note did not load.';
}
