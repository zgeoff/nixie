import { useInfiniteQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import type { MomentSpanRecord } from '../types';
import { useNixieClient } from '../use-nixie-client';

export interface MomentSpanProps {
  readonly momentID: string;
}

const section = css({ marginBlock: '4' });
const heading = css({ fontSize: 'lg', fontWeight: 'semibold' });
const list = css({ display: 'flex', flexDirection: 'column', gap: '2', marginBlock: '2' });

export function MomentSpan(props: MomentSpanProps): ReactNode {
  const nixie = useNixieClient();
  const momentID = props.momentID;

  const span = useInfiniteQuery(
    nixie.queryUtils.memory.readMomentSpan.infiniteOptions({
      input: (after: number | undefined) => ({
        momentID,
        ...(after === undefined ? {} : { after }),
      }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.next ?? undefined,
    }),
  );

  return (
    <section aria-label="The conversation" className={section}>
      <h2 className={heading}>The conversation</h2>
      {span.isPending ? <p>Loading the conversation…</p> : null}
      {span.isError ? <p role="alert">The conversation did not load. Try again.</p> : null}
      {span.data === undefined ? null : (
        <ol aria-label="Records" className={list}>
          {span.data.pages
            .flatMap((page) => page.records)
            .map((record) => (
              <SpanRecord key={record.sequence} record={record} />
            ))}
        </ol>
      )}
      {span.hasNextPage ? (
        <button
          disabled={span.isFetchingNextPage}
          onClick={() => {
            void span.fetchNextPage();
          }}
          type="button"
        >
          Show more of the conversation
        </button>
      ) : null}
    </section>
  );
}

interface SpanRecordProps {
  readonly record: MomentSpanRecord;
}

const quiet = css({ color: 'textMuted', fontSize: 'sm' });
const gap = css({ borderStyle: 'dashed', borderWidth: '1px', color: 'textMuted', padding: '2' });
const speakers: Readonly<Record<string, string>> = { owner_message: 'You', 'model.reply': 'nixie' };

function SpanRecord(props: SpanRecordProps): ReactNode {
  const record = props.record;
  const label = `Record ${String(record.sequence)}`;

  if (record.isGap) {
    return (
      <li aria-label={label} className={gap}>
        Record {record.sequence}: this part is gone. It was forgotten, and the moment keeps its
        place.
      </li>
    );
  }

  const speaker = speakers[record.kind];

  if (speaker !== undefined && record.text !== null) {
    return (
      <li aria-label={label}>
        <p className={quiet}>
          {speaker} · record {record.sequence}
        </p>
        <p className={css({ whiteSpace: 'pre-wrap' })}>{record.text}</p>
      </li>
    );
  }

  if (record.tool !== null) {
    return (
      <li aria-label={label} className={quiet}>
        Record {record.sequence}: nixie called {record.tool}
      </li>
    );
  }

  return null;
}
