import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { findNoteSearchProblem } from '../notebook/find-note-search-problem';
import { parseNoteTags } from '../notebook/parse-note-tags';
import { css } from '../styled-system/css';
import { isUnauthorizedError } from '../utils/is-unauthorized-error';
import { useNixieClient } from '../utils/use-nixie-client';
import { EnrolForm } from './enrol-form';

export interface NotebookListProps {
  readonly showPrivate: boolean;
  readonly query: string;

  // the tags a note must hold, joined by commas
  readonly tags: string;
  readonly onShowPrivateChange: (showPrivate: boolean) => void;
  readonly onSearch: (query: string, tags: string) => void;
}

const page = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '4',
  marginInline: 'auto',
  maxWidth: '4xl',
  paddingBlock: '4',
  paddingInline: '4',
});

const toolbar = css({ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '4' });
const muted = css({ color: 'textMuted', fontSize: 'sm' });
const link = css({ color: 'link', textDecoration: 'underline' });
const list = css({ display: 'flex', flexDirection: 'column', gap: '3', listStyleType: 'none' });

const row = css({
  borderColor: 'border',
  borderWidth: '1px',
  display: 'flex',
  flexDirection: 'column',
  gap: '1',
  padding: '3',
});

// The notes, newest edit first. A private note shows only when the page asks for them, and a page
// that hides them leaves no placeholder or count in their place. A private note's match snippet
// comes from its body, which only Open shows, so the list never prints it.
export function NotebookList(props: NotebookListProps): ReactNode {
  const nixie = useNixieClient();
  const queryClient = useQueryClient();
  const tags = parseNoteTags(props.tags);

  const listed = useInfiniteQuery(
    nixie.queryUtils.notebook.listNotes.infiniteOptions({
      input: (after: string | undefined) => ({
        ...(props.query === '' ? {} : { query: props.query }),
        ...(tags.length === 0 ? {} : { tags }),
        ...(props.showPrivate ? { showPrivate: true } : {}),
        ...(after === undefined ? {} : { after }),
      }),
      initialPageParam: undefined,
      getNextPageParam: (lastPage) => lastPage.next ?? undefined,
      retry: false,
    }),
  );

  if (isUnauthorizedError(listed.error)) {
    return (
      <EnrolForm
        onEnrolled={() => {
          void queryClient.resetQueries({ queryKey: nixie.queryUtils.notebook.key() });
        }}
      />
    );
  }

  const notes = (listed.data?.pages ?? []).flatMap((loaded) => loaded.notes);
  const isPartial = listed.data?.pages.some((loaded) => loaded.isMeaningPartial) === true;
  const isSearching = props.query !== '' || tags.length > 0;

  return (
    <main className={page}>
      <h1>Notebook</h1>
      <div className={toolbar}>
        <SearchForm
          key={`${props.query}|${props.tags}`}
          onSearch={props.onSearch}
          query={props.query}
          tags={props.tags}
        />
        <label className={css({ alignItems: 'center', display: 'flex', gap: '2' })}>
          <input
            checked={props.showPrivate}
            onChange={(event) => {
              props.onShowPrivateChange(event.currentTarget.checked);
            }}
            type="checkbox"
          />
          Show private
        </label>
        <Link
          className={link}
          search={props.showPrivate ? { private: 1 } : {}}
          to="/notebook/check"
        >
          Check
        </Link>
      </div>
      {isPartial ? (
        <p className={muted}>
          Meaning search has not reached every note yet, so some notes match by their words alone.
        </p>
      ) : null}
      {listed.isError ? (
        <div role="alert">
          <p>The notes can&apos;t load.</p>
          <button
            onClick={() => {
              void listed.refetch();
            }}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : null}
      {listed.isPending ? <p className={muted}>Loading notes…</p> : null}
      {listed.isSuccess && notes.length === 0 ? (
        <p className={muted}>
          {isSearching
            ? 'No note matches.'
            : 'No notes yet. Notes appear here when the assistant writes one.'}
        </p>
      ) : null}
      <ul aria-label="Notes" className={list}>
        {notes.map((note) => (
          <li className={row} key={note.note}>
            <Link
              className={link}
              params={{ note: note.note }}
              search={props.showPrivate ? { private: 1 } : {}}
              to="/notebook/$note"
            >
              {note.title}
            </Link>
            <span className={muted}>
              {[
                note.isPrivate ? 'Private' : null,
                note.tags.length === 0 ? null : `Tags: ${note.tags.join(', ')}`,
                `Updated ${note.updatedAt.toLocaleString()}`,
                `${note.backlinkCount} ${note.backlinkCount === 1 ? 'backlink' : 'backlinks'}`,
              ]
                .filter((part) => part !== null)
                .join(' · ')}
            </span>
            {note.match === null || note.isPrivate ? null : (
              <span className={muted}>{note.match}</span>
            )}
          </li>
        ))}
      </ul>
      {listed.hasNextPage ? (
        <div>
          <button
            disabled={listed.isFetchingNextPage}
            onClick={() => {
              void listed.fetchNextPage();
            }}
            type="button"
          >
            Load more
          </button>
        </div>
      ) : null}
    </main>
  );
}

interface SearchFormProps {
  readonly query: string;
  readonly tags: string;
  readonly onSearch: (query: string, tags: string) => void;
}

const form = css({ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '2' });

function SearchForm(props: SearchFormProps): ReactNode {
  const [query, setQuery] = useState(props.query);
  const [tags, setTags] = useState(props.tags);
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <form
      className={form}
      onSubmit={(event) => {
        event.preventDefault();

        const trimmed = query.trim();
        const parsed = parseNoteTags(tags);
        const found = findNoteSearchProblem(trimmed, parsed);

        setProblem(found);

        if (found === null) {
          props.onSearch(trimmed, parsed.join(','));
        }
      }}
      role="search"
    >
      <label>
        Search notes{' '}
        <input
          onChange={(event) => {
            setQuery(event.currentTarget.value);
          }}
          type="search"
          value={query}
        />
      </label>
      <label>
        Tags{' '}
        <input
          onChange={(event) => {
            setTags(event.currentTarget.value);
          }}
          placeholder="home, boiler"
          type="text"
          value={tags}
        />
      </label>
      <button type="submit">Search</button>
      {problem === null ? null : <p role="alert">{problem}</p>}
    </form>
  );
}
