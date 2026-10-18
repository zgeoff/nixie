import type { ReactNode } from 'react';
import { useState } from 'react';
import { formatMemoryDate } from '../format-memory-date';
import { formatMemoryProvenance } from '../format-memory-provenance';
import { css } from '../styled-system/css';
import type { MemoryItem } from '../types';
import { MemoryItemHistory } from './memory-item-history';
import { SelfNoteBadge } from './self-note-badge';

export interface MemoryItemRowProps {
  readonly item: MemoryItem;

  // the controls that change the item, which sit below its text
  readonly children?: ReactNode;
}

// One item as a list shows it: its text, who wrote its current version and from what, when it was
// created, and its history, which loads when opened. A self-note carries its mark in every list. A
// forgotten item shows as a dated gap, with the controls that can still finish its forget.
export function MemoryItemRow(props: MemoryItemRowProps): ReactNode {
  const item = props.item;

  if (item.status === 'shredded' && item.state !== 'active') {
    return (
      <li aria-label={item.shortID} className={row}>
        <p className={meta}>
          {item.subject === 'self' ? <SelfNoteBadge /> : null}
          Forgotten item · created {formatMemoryDate(item.createdAt)}
          {item.forgottenAt === null
            ? ' · forgetting'
            : ` · forgotten ${formatMemoryDate(item.forgottenAt)}`}
        </p>
        {props.children}
      </li>
    );
  }

  return (
    <li aria-label={item.shortID} className={row}>
      <p className={css({ whiteSpace: 'pre-wrap' })}>
        {item.status === 'readable' ? item.text : `(${item.status})`}
      </p>
      <p className={meta}>
        {item.subject === 'self' ? <SelfNoteBadge /> : null}
        {formatMemoryProvenance(item.origin, item.source)} · created{' '}
        {formatMemoryDate(item.createdAt)}
        {item.isPinned ? ' · pinned' : ''}
      </p>
      {props.children}
      <ItemHistory itemID={item.itemID} />
    </li>
  );
}

const row = css({ borderBottomWidth: '1px', paddingBlock: '2' });
const meta = css({ color: 'textMuted', fontSize: 'sm' });

interface ItemHistoryProps {
  readonly itemID: string;
}

// closed until you open it, so a long list reads no history it never shows
function ItemHistory(props: ItemHistoryProps): ReactNode {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <details
      onToggle={(event) => {
        setIsOpen(event.currentTarget.open);
      }}
    >
      <summary className={css({ cursor: 'pointer', fontSize: 'sm' })}>History</summary>
      {isOpen ? <MemoryItemHistory itemID={props.itemID} /> : null}
    </details>
  );
}
