import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import type { MemoryItem } from '../types';
import { MemoryItemActions } from './memory-item-actions';
import { MemoryItemList } from './memory-item-list';
import { MemoryItemRow } from './memory-item-row';
import { MemorySearchResults } from './memory-search';
import { MemorySearchForm } from './memory-search-form';
import { PinnedCorePanel } from './pinned-core-panel';
import { WriterStatusPanel } from './writer-status-panel';

export interface MemoryViewProps {
  // the links to the app's other views, which the route supplies
  readonly navigation?: ReactNode;
}

// Every memory item, to see, search and review: the writer's progress, the pinned core, the active
// items or the matches of a search, then the retired items and the forgotten ones apart from them.
export function MemoryView(props: MemoryViewProps): ReactNode {
  const [query, setQuery] = useState<string | null>(null);

  return (
    <main className={layout}>
      <header className={header}>
        <h1 className={css({ fontSize: 'xl', fontWeight: 'bold' })}>Memory</h1>
        {props.navigation}
      </header>
      <WriterStatusPanel />
      <PinnedCorePanel renderItem={renderItem} />
      <MemorySearchForm onSearch={setQuery} query={query} />
      {query === null ? (
        <MemoryItemList
          empty="No active item."
          renderItem={renderItem}
          state="active"
          title="Active"
        />
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

// every list renders an item the same way, so a later control joins them all here
function renderItem(item: MemoryItem): ReactNode {
  return (
    <MemoryItemRow key={item.itemID} item={item}>
      <MemoryItemActions item={item} />
    </MemoryItemRow>
  );
}

const layout = css({
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '4',
  paddingInline: '4',
});

const header = css({ alignItems: 'baseline', display: 'flex', justifyContent: 'space-between' });
