import type { ReactNode } from 'react';
import type { CompactionActivity } from '../conversation/build-activity';
import { formatCompaction } from '../conversation/format-compaction';
import { markerRule } from './marker-rule';

export interface CompactionMarkerProps {
  readonly compaction: CompactionActivity;
}

export function CompactionMarker(props: CompactionMarkerProps): ReactNode {
  return (
    <p aria-label="compaction" className={markerRule} role="note">
      {formatCompaction(props.compaction)}
    </p>
  );
}
