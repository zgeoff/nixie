import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import type { MemoryItem } from '../types';
import { useNixieClient } from '../use-nixie-client';

export interface MemorySearchResultsProps {
  readonly query: string;
  readonly renderItem: (item: MemoryItem) => ReactNode;
}

// The active items that match a search, best first, ranked as a recall ranks them.
export function MemorySearchResults(props: MemorySearchResultsProps): ReactNode {
  const nixie = useNixieClient();

  const found = useQuery(
    nixie.queryUtils.memory.findItems.queryOptions({ input: { query: props.query } }),
  );

  return (
    <section aria-label="Search results" className={css({ marginBlock: '4' })}>
      <h2 className={css({ fontSize: 'lg', fontWeight: 'semibold' })}>
        Items that match “{props.query}”
      </h2>
      <SearchMatches
        isError={found.isError}
        items={found.data?.items}
        query={props.query}
        renderItem={props.renderItem}
      />
    </section>
  );
}

interface SearchMatchesProps {
  readonly items: readonly MemoryItem[] | undefined;
  readonly isError: boolean;
  readonly query: string;
  readonly renderItem: (item: MemoryItem) => ReactNode;
}

function SearchMatches(props: SearchMatchesProps): ReactNode {
  if (props.isError) {
    return <p role="alert">The search did not finish.</p>;
  }

  if (props.items === undefined) {
    return <p>Searching…</p>;
  }

  if (props.items.length === 0) {
    return <p className={css({ color: 'textMuted' })}>No active item matches “{props.query}”.</p>;
  }

  return <ul>{props.items.map((item) => props.renderItem(item))}</ul>;
}
