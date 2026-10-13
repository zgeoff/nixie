import type { ReactNode } from 'react';
import type { CompactionActivity } from '../build-activity';
import { formatCompaction } from '../format-compaction';
import { css } from '../styled-system/css';

export interface CompactionMarkerProps {
  readonly compaction: CompactionActivity;
}

// A rule across the feed where the session compacted, with its tokens before and after, so the
// turns on each side of it read apart.
export function CompactionMarker(props: CompactionMarkerProps): ReactNode {
  return (
    <p
      aria-label="compaction"
      className={css({
        _after: { borderTopWidth: '1px', content: '""', flex: '1' },
        _before: { borderTopWidth: '1px', content: '""', flex: '1' },
        alignItems: 'center',
        color: 'textMuted',
        display: 'flex',
        fontSize: 'xs',
        gap: '2',
        paddingBlock: '1',
      })}
      role="note"
    >
      {formatCompaction(props.compaction)}
    </p>
  );
}
