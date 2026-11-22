import { useInfiniteQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { css } from '../styled-system/css';
import { useIsSeen } from '../utils/use-is-seen';
import { useNixieClient } from '../utils/use-nixie-client';
import { ImageLightbox } from './image-lightbox';
import { ImageTile } from './image-tile';

export interface ImageGalleryProps {
  // true lists every image; false lists the pinned ones
  readonly isAll: boolean;

  // the image the lightbox shows, or undefined for none
  readonly openImage: string | undefined;
  readonly onAllChange: (isAll: boolean) => void;
  readonly onOpen: (image: string) => void;
  readonly onClose: () => void;
}

const page = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '4',
  marginInline: 'auto',
  maxWidth: '5xl',
  paddingBlock: '4',
  paddingInline: '4',
});

const toggle = css({ alignItems: 'center', display: 'flex', gap: '2' });
const notice = css({ color: 'textMuted', fontSize: 'sm' });

const grid = css({
  display: 'grid',
  gap: '3',
  gridTemplateColumns: 'repeat(auto-fill, minmax(12rem, 1fr))',
  listStyleType: 'none',
  margin: '0',
  padding: '0',
});

const emptyPinned =
  'No image is pinned. The assistant pins an image when you ask it to. Tick Show all to see every image.';

const emptyAll = 'No images yet. Images appear here when the assistant draws or imports one.';

export function ImageGallery(props: ImageGalleryProps): ReactNode {
  const nixie = useNixieClient();
  const [forgotten, setForgotten] = useState<ReadonlySet<string>>(new Set());

  const listed = useInfiniteQuery(
    nixie.queryUtils.images.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        ...(cursor === undefined ? {} : { cursor }),
        ...(props.isAll ? {} : { pinnedOnly: true }),
      }),
      initialPageParam: undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      retry: false,
    }),
  );

  const refetch = listed.refetch;

  const handleForgotten = useCallback(
    (image: string) => {
      setForgotten((earlier) => new Set([...earlier, image]));
      void refetch();
    },
    [refetch],
  );

  const images = (listed.data?.pages ?? [])
    .flatMap((loaded) => loaded.images)
    .filter((image) => !forgotten.has(image.image));

  return (
    <main className={page}>
      <h1>Images</h1>
      <label className={toggle}>
        <input
          checked={props.isAll}
          onChange={(event) => {
            props.onAllChange(event.currentTarget.checked);
          }}
          type="checkbox"
        />
        Show all
      </label>
      {listed.isError ? (
        <div role="alert">
          <p>The images can&apos;t load.</p>
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
      {listed.isPending ? <p className={notice}>Loading images…</p> : null}
      {listed.isSuccess && images.length === 0 && !listed.hasNextPage ? (
        <p className={notice}>{props.isAll ? emptyAll : emptyPinned}</p>
      ) : null}
      <ul className={grid}>
        {images.map((image) => (
          <ImageTile
            image={image}
            key={image.image}
            onForgotten={handleForgotten}
            onOpen={props.onOpen}
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
      {props.openImage === undefined ? null : (
        <ImageLightbox
          image={props.openImage}
          onClose={props.onClose}
          onForgotten={handleForgotten}
        />
      )}
    </main>
  );
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
