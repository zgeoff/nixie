import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import { makeMemoryItemRenderer } from './make-memory-item-renderer';
import { MemoryExportButton } from './memory-export-button';
import { MemoryItemList } from './memory-item-list';
import { MemorySearchResults } from './memory-search';
import { MemorySearchForm } from './memory-search-form';
import { PinnedCorePanel } from './pinned-core-panel';
import { WriterStatusPanel } from './writer-status-panel';

export interface MemoryViewProps {
  // the links to the app's other views, which the route supplies
  readonly navigation?: ReactNode;
}

// Every memory item, to see, search, review and export: the writer's progress, the pinned core,
// the export, the active items or the matches of a search, then the retired items and the
// forgotten ones apart from them.
export function MemoryView(props: MemoryViewProps): ReactNode {
  const [query, setQuery] = useState<string | null>(null);

  // a refused change refreshes the lists and can move its item to another list, so its reason
  // shows at the top of the page, apart from every row
  const [notice, setNotice] = useState<string | null>(null);
  const renderItem = makeMemoryItemRenderer(setNotice);

  return (
    <main className={layout}>
      <header className={header}>
        <h1 className={css({ fontSize: 'xl', fontWeight: 'bold' })}>Memory</h1>
        {props.navigation}
      </header>
      {notice === null ? null : <p role="alert">{notice}</p>}
      <WriterStatusPanel />
      <PinnedCorePanel renderItem={renderItem} />
      <MemoryExportButton />
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

const layout = css({
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '4',
  paddingInline: '4',
});

const header = css({ alignItems: 'baseline', display: 'flex', justifyContent: 'space-between' });
