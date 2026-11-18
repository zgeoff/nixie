import { useInfiniteQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { css } from '../styled-system/css';
import { useIsSeen } from '../utils/use-is-seen';
import { useNixieClient } from '../utils/use-nixie-client';
import { FileTile } from './file-tile';

type FileKind = 'image' | 'other';

export interface FileGalleryProps {
  readonly kind: FileKind | undefined;
  readonly onKindChange: (kind: FileKind | undefined) => void;
}

const filters: readonly { readonly kind: FileKind | undefined; readonly label: string }[] = [
  { kind: undefined, label: 'All' },
  { kind: 'image', label: 'Images' },
  { kind: 'other', label: 'Other files' },
];

const page = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '4',
  marginInline: 'auto',
  maxWidth: '5xl',
  paddingBlock: '4',
  paddingInline: '4',
});

const filterBar = css({ display: 'flex', flexWrap: 'wrap', gap: '2' });
const notice = css({ color: 'textMuted', fontSize: 'sm' });

const grid = css({
  display: 'grid',
  gap: '3',
  gridTemplateColumns: 'repeat(auto-fill, minmax(12rem, 1fr))',
  listStyleType: 'none',
  margin: '0',
  padding: '0',
});

export function FileGallery(props: FileGalleryProps): ReactNode {
  const nixie = useNixieClient();
  const [forgottenRuns, setForgottenRuns] = useState<ReadonlySet<string>>(new Set());

  const listed = useInfiniteQuery(
    nixie.queryUtils.files.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        ...(cursor === undefined ? {} : { cursor }),
        ...(props.kind === undefined ? {} : { kind: props.kind }),
      }),
      initialPageParam: undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    }),
  );

  const files = (listed.data?.pages ?? [])
    .flatMap((loaded) => loaded.files)
    .filter((file) => !forgottenRuns.has(`${file.thread}:${String(file.sequence)}`));

  return (
    <main className={page}>
      <h1>Files</h1>
      <div aria-label="Filter files" className={filterBar} role="group">
        {filters.map((filter) => (
          <button
            aria-pressed={props.kind === filter.kind}
            key={filter.label}
            onClick={() => {
              props.onKindChange(filter.kind);
            }}
            type="button"
          >
            {filter.label}
          </button>
        ))}
      </div>
      {listed.isError ? <p role="alert">The files did not load.</p> : null}
      {listed.isPending ? <p className={notice}>Loading files…</p> : null}
      {listed.isSuccess && files.length === 0 && !listed.hasNextPage ? (
        <p className={notice}>{describeEmpty(props.kind)}</p>
      ) : null}
      <ul className={grid}>
        {files.map((file) => (
          <FileTile
            file={file}
            key={file.file}
            onRunForgotten={() => {
              setForgottenRuns(
                (earlier) => new Set([...earlier, `${file.thread}:${String(file.sequence)}`]),
              );

              void listed.refetch();
            }}
          />
        ))}
      </ul>
      {listed.hasNextPage ? (
        <LoadMore
          key={listed.data?.pages.length}
          isLoading={listed.isFetchingNextPage}
          onLoad={() => {
            void listed.fetchNextPage();
          }}
        />
      ) : null}
    </main>
  );
}

function describeEmpty(kind: FileKind | undefined): string {
  if (kind === undefined) {
    return 'No files yet. Files appear here when nixie runs code that writes them.';
  }

  return kind === 'image' ? 'No images match.' : 'No other files match.';
}

interface LoadMoreProps {
  readonly isLoading: boolean;
  readonly onLoad: () => void;
}

function LoadMore(props: LoadMoreProps): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const isSeen = useIsSeen(ref);
  const onLoad = props.onLoad;

  // The gallery gives each page its own LoadMore, so the end of the grid scrolling into view loads
  // one page, and the button loads the rest.
  const didLoad = useRef(false);

  useEffect(() => {
    if (isSeen && !didLoad.current) {
      didLoad.current = true;

      onLoad();
    }
  }, [isSeen, onLoad]);

  return (
    <div ref={ref}>
      <button disabled={props.isLoading} onClick={onLoad} type="button">
        Load more
      </button>
    </div>
  );
}
