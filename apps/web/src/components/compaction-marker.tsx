import type { ReactNode } from 'react';
import type { CompactionActivity } from '../build-activity';
import { formatCompaction } from '../format-compaction';
import { markerRule } from './marker-rule';

export interface CompactionMarkerProps {
  readonly compaction: CompactionActivity;
}

// A rule across the feed where the session compacted, with its tokens before and after, so the
// turns on each side of it read apart.
export function CompactionMarker(props: CompactionMarkerProps): ReactNode {
  return (
    <p aria-label="compaction" className={markerRule} role="note">
      {formatCompaction(props.compaction)}
    </p>
  );
}
