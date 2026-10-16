import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import type { MemoryItem } from '../types';
import { useNixieClient } from '../use-nixie-client';

export interface PinnedCorePanelProps {
  readonly renderItem: (item: MemoryItem) => ReactNode;
}

// The pinned core, which every session opens with, in the order its items were pinned, and its
// size against its budget in tokens.
export function PinnedCorePanel(props: PinnedCorePanelProps): ReactNode {
  const nixie = useNixieClient();
  const core = useQuery(nixie.queryUtils.memory.readPinnedCore.queryOptions());

  return (
    <section aria-label="Pinned core" className={css({ marginBlock: '4' })}>
      <h2 className={css({ fontSize: 'lg', fontWeight: 'semibold' })}>Pinned core</h2>
      <PinnedItems isError={core.isError} renderItem={props.renderItem} size={core.data} />
    </section>
  );
}

interface PinnedItemsProps {
  readonly size:
    | { readonly items: readonly MemoryItem[]; readonly tokens: number; readonly budget: number }
    | undefined;
  readonly isError: boolean;
  readonly renderItem: (item: MemoryItem) => ReactNode;
}

function PinnedItems(props: PinnedItemsProps): ReactNode {
  if (props.isError) {
    return <p role="alert">The pinned core did not load.</p>;
  }

  if (props.size === undefined) {
    return <p>Loading…</p>;
  }

  return (
    <>
      <p className={css({ color: 'textMuted', fontSize: 'sm' })}>
        {props.size.tokens.toLocaleString('en')} of {props.size.budget.toLocaleString('en')} tokens
      </p>
      {props.size.items.length === 0 ? (
        <p className={css({ color: 'textMuted' })}>No item is pinned.</p>
      ) : (
        <ul>{props.size.items.map((item) => props.renderItem(item))}</ul>
      )}
    </>
  );
}
