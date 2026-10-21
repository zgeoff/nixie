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

  readonly children?: ReactNode;
}

const row = css({ borderBottomWidth: '1px', paddingBlock: '2' });
const meta = css({ color: 'textMuted', fontSize: 'sm' });

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

interface ItemHistoryProps {
  readonly itemID: string;
}

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
