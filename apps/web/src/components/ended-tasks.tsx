import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useIsHydrated } from '../conversation/use-is-hydrated';
import { useLiveUnavailable } from '../live/use-live-unavailable';
import { css } from '../styled-system/css';
import { buildReportSince } from '../task/build-report-since';
import { buildTaskHref } from '../task/build-task-href';
import { formatReportEntry } from '../task/format-report-entry';
import { useNixieClient } from '../utils/use-nixie-client';

const pageSize = 50;

const page = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '6',
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '4',
  paddingInline: '4',
});

const notice = css({ color: 'textMuted', fontSize: 'sm' });
const list = css({ display: 'flex', flexDirection: 'column', gap: '3' });
const heading = css({ fontSize: 'lg', fontWeight: 'semibold' });
const link = css({ color: 'link', textDecoration: 'underline' });

export function EndedTasks(): ReactNode {
  const nixie = useNixieClient();
  const isHydrated = useIsHydrated();
  const since = isHydrated ? buildReportSince(new Date()) : undefined;
  const isUnavailable = useLiveUnavailable();

  const ended = useInfiniteQuery(
    nixie.queryUtils.tasks.listEnded.infiniteOptions({
      input: (before: number | undefined) => ({
        limit: pageSize,
        ...(before === undefined ? {} : { before }),
      }),
      initialPageParam: undefined,
      getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    }),
  );

  const report = useQuery({
    ...nixie.queryUtils.triggers.report.queryOptions({ input: { since: since ?? '' } }),
    enabled: since !== undefined,
  });

  const pages = ended.data?.pages ?? [];
  const runs = pages.flatMap((loaded) => loaded.runs);

  const names = new Map(
    pages.flatMap((loaded) => loaded.tasks).map((task) => [task.taskID, task.name]),
  );

  return (
    <main className={page}>
      <h1>Ended task runs</h1>
      {isUnavailable ? (
        <p className={notice} role="status">
          Live updates unavailable
        </p>
      ) : null}
      <section aria-label="Trigger report">
        <h2 className={heading}>Trigger report</h2>
        {report.isError ? <p role="alert">The trigger report did not load.</p> : null}
        {report.data === undefined || report.data.entries.length > 0 ? null : (
          <p className={notice}>No late or skipped fires since {since}.</p>
        )}
        <ul className={list}>
          {report.data?.entries.map((entry) => (
            <li key={entry.sequence}>{formatReportEntry(entry)}</li>
          ))}
        </ul>
      </section>
      <section aria-label="Ended runs">
        <h2 className={heading}>Ended runs</h2>
        {ended.isPending ? <p>Loading the ended runs…</p> : null}
        {ended.isError ? (
          <p role="alert">
            The ended runs did not load.{' '}
            <button
              onClick={() => {
                void ended.refetch();
              }}
              type="button"
            >
              Load them again
            </button>
          </p>
        ) : null}
        {ended.isSuccess && runs.length === 0 ? (
          <p className={notice}>No task run has ended.</p>
        ) : null}
        <ul className={list}>
          {runs.map((run) => (
            <li key={run.sequence}>
              <a className={link} href={buildTaskHref(run.taskID)}>
                {names.get(run.taskID) ?? run.taskID}
              </a>
              <span className={notice}>
                {' '}
                · {run.cause} · {run.used.turns} {run.used.turns === 1 ? 'turn' : 'turns'} · $
                {run.used.dollars.toFixed(2)} · ended{' '}
                {isHydrated ? run.endedAt.toLocaleString('en') : ''}
                {run.fire === null ? '' : ` · started by the fire of ${run.fire.scheduledFor}`}
                {run.fire?.isCatchUp === true ? ' (a catch-up)' : ''}
              </span>
            </li>
          ))}
        </ul>
        {ended.hasNextPage ? (
          <button
            disabled={ended.isFetchingNextPage}
            onClick={() => {
              void ended.fetchNextPage();
            }}
            type="button"
          >
            Show older runs
          </button>
        ) : null}
      </section>
    </main>
  );
}
