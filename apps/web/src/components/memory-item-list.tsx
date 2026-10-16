import { useInfiniteQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import type { MemoryItem } from '../types';
import { useNixieClient } from '../use-nixie-client';

export interface MemoryItemListProps {
  readonly state: 'active' | 'retired' | 'forgotten';
  readonly title: string;

  // what the list says when it holds no item
  readonly empty: string;

  // renders one item, so a later control joins every list in one place
  readonly renderItem: (item: MemoryItem) => ReactNode;
}

// The items of one state a page at a time, in the order they were created, with a control that
// reads the next page.
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
      <ItemPages
        empty={props.empty}
        hasNextPage={pages.hasNextPage}
        isError={pages.isError}
        isFetchingNextPage={pages.isFetchingNextPage}
        items={pages.data?.pages.flatMap((page) => page.items)}
        onShowMore={() => {
          void pages.fetchNextPage();
        }}
        renderItem={props.renderItem}
      />
    </section>
  );
}

const section = css({ marginBlock: '4' });
const heading = css({ fontSize: 'lg', fontWeight: 'semibold' });

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

  if (props.items.length === 0) {
    return <p className={css({ color: 'textMuted' })}>{props.empty}</p>;
  }

  return (
    <>
      <ul>{props.items.map((item) => props.renderItem(item))}</ul>
      {props.hasNextPage ? (
        <button disabled={props.isFetchingNextPage} onClick={props.onShowMore} type="button">
          Show more
        </button>
      ) : null}
    </>
  );
}
