import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import type { MemoryItem } from '../types';
import { useNixieClient } from '../use-nixie-client';
import { makeMemoryItemRenderer } from './make-memory-item-renderer';
import { MemoryExportButton } from './memory-export-button';
import { MemoryItemList } from './memory-item-list';
import { MemorySearchResults } from './memory-search';
import { MemorySearchForm } from './memory-search-form';
import { PinnedCorePanel } from './pinned-core-panel';
import { WriterStatusPanel } from './writer-status-panel';

export interface MemoryViewProps {
  readonly navigation?: ReactNode;

  readonly openItemID?: string;
}

const layout = css({
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '4',
  paddingInline: '4',
});

const header = css({ alignItems: 'baseline', display: 'flex', justifyContent: 'space-between' });

export function MemoryView(props: MemoryViewProps): ReactNode {
  const [query, setQuery] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const renderItem = makeMemoryItemRenderer(setNotice);

  return (
    <main className={layout}>
      <header className={header}>
        <h1 className={css({ fontSize: 'xl', fontWeight: 'bold' })}>Memory</h1>
        {props.navigation}
      </header>
      {notice === null ? null : <p role="alert">{notice}</p>}
      {props.openItemID === undefined ? null : (
        <OpenedItem itemID={props.openItemID} renderItem={renderItem} />
      )}
      <WriterStatusPanel />
      <PinnedCorePanel renderItem={renderItem} />
      <MemoryExportButton />
      <MemorySearchForm onSearch={setQuery} query={query} />
      {query === null ? (
        <ActiveItems renderItem={renderItem} />
      ) : (
        <MemorySearchResults query={query} renderItem={renderItem} />
      )}
      <MemoryItemList
        empty="No retired item."
        renderItem={renderItem}
        state="retired"
        title="Retired"
      />
      <MemoryItemList
        empty="No forgotten item."
        renderItem={renderItem}
        state="forgotten"
        title="Forgotten"
      />
    </main>
  );
}

interface OpenedItemProps {
  readonly itemID: string;

  readonly renderItem: (item: MemoryItem) => ReactNode;
}

const section = css({ marginBlock: '4' });
const heading = css({ fontSize: 'lg', fontWeight: 'semibold' });

function OpenedItem(props: OpenedItemProps): ReactNode {
  const nixie = useNixieClient();

  const item = useQuery(
    nixie.queryUtils.memory.readItem.queryOptions({ input: { itemID: props.itemID } }),
  );

  return (
    <section aria-label="Opened item" className={section}>
      <h2 className={heading}>Opened item</h2>
      {item.isPending ? <p>Loading the item…</p> : null}
      {item.isError ? <p role="alert">This item did not load. It may be gone.</p> : null}
      {item.data === undefined ? null : <ul>{props.renderItem(item.data)}</ul>}
    </section>
  );
}

interface ActiveItemsProps {
  readonly renderItem: (item: MemoryItem) => ReactNode;
}

function ActiveItems(props: ActiveItemsProps): ReactNode {
  return (
    <>
      <MemoryItemList
        empty="No active item."
        kind="fact"
        renderItem={props.renderItem}
        state="active"
        title="Active"
      />
      <MemoryItemList
        empty="No self-note."
        kind="self"
        renderItem={props.renderItem}
        state="active"
        title="Self-notes"
      />
    </>
  );
}
