import { useInfiniteQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { formatMemoryDate } from '../format-memory-date';
import { css } from '../styled-system/css';
import type { MomentSummary } from '../types';
import { useNixieClient } from '../use-nixie-client';

export interface MomentTimelineProps {
  readonly navigation?: ReactNode;
}

const layout = css({
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '4',
  paddingInline: '4',
});

const header = css({ alignItems: 'baseline', display: 'flex', justifyContent: 'space-between' });
const controls = css({ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '3' });

const search = css({
  alignItems: 'center',
  display: 'flex',
  flex: '1',
  gap: '2',
  marginBlock: '3',
});

export function MomentTimeline(props: MomentTimelineProps): ReactNode {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [includeRetired, setIncludeRetired] = useState(false);

  return (
    <main className={layout}>
      <header className={header}>
        <h1 className={css({ fontSize: 'xl', fontWeight: 'bold' })}>Moments</h1>
        {props.navigation}
      </header>
      <div className={controls}>
        <form
          className={search}
          onSubmit={(event) => {
            event.preventDefault();

            setQuery(text.trim());
          }}
          role="search"
        >
          <label className={css({ display: 'flex', flex: '1', gap: '2' })}>
            Search moments
            <input
              className={css({ borderWidth: '1px', flex: '1', paddingInline: '2' })}
              maxLength={500}
              onChange={(event) => {
                setText(event.target.value);
              }}
              type="search"
              value={text}
            />
          </label>
          <button type="submit">Search</button>
        </form>
        <label>
          <input
            checked={includeRetired}
            onChange={(event) => {
              setIncludeRetired(event.target.checked);
            }}
            type="checkbox"
          />{' '}
          Show retired moments
        </label>
      </div>
      <MomentList includeRetired={includeRetired} query={query} />
    </main>
  );
}

interface MomentListProps {
  readonly includeRetired: boolean;
  readonly query: string;
}

function MomentList(props: MomentListProps): ReactNode {
  const nixie = useNixieClient();
  const query = props.query;

  const moments = useInfiniteQuery(
    nixie.queryUtils.memory.listMoments.infiniteOptions({
      input: (before: number | undefined) => ({
        includeRetired: props.includeRetired,
        ...(query === '' ? {} : { query }),
        ...(before === undefined ? {} : { before }),
      }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.next ?? undefined,
    }),
  );

  if (moments.isPending) {
    return <p>Loading the moments…</p>;
  }

  if (moments.isError) {
    return <p role="alert">The moments did not load. Reload the page to try again.</p>;
  }

  const shown = moments.data.pages.flatMap((page) => page.moments);

  if (shown.length === 0) {
    return <p>{query === '' ? 'No moment kept yet.' : 'No moment matches the search.'}</p>;
  }

  return (
    <>
      <ol
        aria-label="Moments"
        className={css({ display: 'flex', flexDirection: 'column', gap: '3' })}
      >
        {shown.map((moment) => (
          <MomentEntry key={moment.momentID} moment={moment} />
        ))}
      </ol>
      {moments.hasNextPage ? (
        <button
          disabled={moments.isFetchingNextPage}
          onClick={() => {
            void moments.fetchNextPage();
          }}
          type="button"
        >
          Show older moments
        </button>
      ) : null}
    </>
  );
}

interface MomentEntryProps {
  readonly moment: MomentSummary;
}

const quiet = css({ color: 'textMuted', fontSize: 'sm' });
const link = css({ color: 'link', textDecoration: 'underline' });

function MomentEntry(props: MomentEntryProps): ReactNode {
  const moment = props.moment;
  const title = moment.title ?? 'Title unreadable';

  return (
    <li aria-label={title}>
      <a className={link} href={`/moments/${moment.momentID}`}>
        {title}
      </a>
      <p className={quiet}>
        Kept {formatMemoryDate(moment.keptAt)}
        {moment.keptBy === 'model' ? ' by nixie' : ' by you'}
        {moment.editedAt === null ? null : ` · edited ${formatMemoryDate(moment.editedAt)}`}
        {moment.state === 'retired' ? ' · retired' : null}
      </p>
    </li>
  );
}
