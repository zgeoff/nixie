import { useInfiniteQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import type { MemoryItem } from '../types';
import { useNixieClient } from '../use-nixie-client';

export interface MemoryItemListProps {
  readonly state: 'active' | 'retired' | 'forgotten';

  readonly kind?: MemoryItem['kind'];
  readonly title: string;

  readonly empty: string;

  readonly actions?: ReactNode;

  readonly renderItem: (item: MemoryItem) => ReactNode;
}

const section = css({ marginBlock: '4' });
const heading = css({ fontSize: 'lg', fontWeight: 'semibold' });

export function MemoryItemList(props: MemoryItemListProps): ReactNode {
  const nixie = useNixieClient();

  const pages = useInfiniteQuery(
    nixie.queryUtils.memory.listItems.infiniteOptions({
      input: (after: string | undefined) => ({
        state: props.state,
        ...(after === undefined ? {} : { after }),
      }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.next ?? undefined,
    }),
  );

  return (
    <section aria-label={props.title} className={section}>
      <h2 className={heading}>{props.title}</h2>
      {props.actions}
      <ItemPages
        empty={props.empty}
        hasNextPage={pages.hasNextPage}
        isError={pages.isError}
        isFetchingNextPage={pages.isFetchingNextPage}
        items={pages.data?.pages.flatMap((page) =>
          page.items.filter((item) => props.kind === undefined || item.kind === props.kind),
        )}
        onShowMore={() => {
          void pages.fetchNextPage();
        }}
        renderItem={props.renderItem}
      />
    </section>
  );
}

interface ItemPagesProps {
  readonly items: readonly MemoryItem[] | undefined;
  readonly empty: string;
  readonly isError: boolean;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly onShowMore: () => void;
  readonly renderItem: (item: MemoryItem) => ReactNode;
}

function ItemPages(props: ItemPagesProps): ReactNode {
  if (props.isError) {
    return <p role="alert">These items did not load.</p>;
  }

  if (props.items === undefined) {
    return <p>Loading…</p>;
  }

  if (props.items.length === 0 && !props.hasNextPage) {
    return <p className={css({ color: 'textMuted' })}>{props.empty}</p>;
  }

  return (
    <>
      {props.items.length > 0 ? <ul>{props.items.map((item) => props.renderItem(item))}</ul> : null}
      {props.hasNextPage ? (
        <button disabled={props.isFetchingNextPage} onClick={props.onShowMore} type="button">
          Show more
        </button>
      ) : null}
    </>
  );
}
