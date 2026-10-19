import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import type { MemoryItem } from '../types';
import { useNixieClient } from '../use-nixie-client';

export interface MemorySearchResultsProps {
  readonly query: string;
  readonly renderItem: (item: MemoryItem) => ReactNode;
}

// The active items that match a search, best first, ranked as a recall ranks them, with the
// self-notes that match apart from the facts. A failed search says so once.
export function MemorySearchResults(props: MemorySearchResultsProps): ReactNode {
  const nixie = useNixieClient();

  const found = useQuery(
    nixie.queryUtils.memory.findItems.queryOptions({ input: { query: props.query } }),
  );

  const items = found.data?.items;

  return (
    <>
      <section aria-label="Search results" className={section}>
        <h2 className={heading}>Items that match “{props.query}”</h2>
        <SearchMatches
          empty={`No active item matches “${props.query}”.`}
          isError={found.isError}
          items={items?.filter((item) => item.subject !== 'self')}
          renderItem={props.renderItem}
        />
      </section>
      {found.isError ? null : (
        <section aria-label="Self-notes" className={section}>
          <h2 className={heading}>Self-notes that match “{props.query}”</h2>
          <SearchMatches
            empty={`No self-note matches “${props.query}”.`}
            isError={false}
            items={items?.filter((item) => item.subject === 'self')}
            renderItem={props.renderItem}
          />
        </section>
      )}
    </>
  );
}

const section = css({ marginBlock: '4' });
const heading = css({ fontSize: 'lg', fontWeight: 'semibold' });

interface SearchMatchesProps {
  readonly items: readonly MemoryItem[] | undefined;
  readonly isError: boolean;

  // what the section says when no item of its kind matches
  readonly empty: string;
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
    return <p className={css({ color: 'textMuted' })}>{props.empty}</p>;
  }

  return <ul>{props.items.map((item) => props.renderItem(item))}</ul>;
}
