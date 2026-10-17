import type { ReactNode } from 'react';
import type { LiveRecord } from '../use-live-records';
import { markerRule } from './marker-rule';

export interface ResetMarkerProps {
  readonly record: LiveRecord;
}

// A rule at the top of the feed where a reset removed every earlier record, with the time it ran
// in the browser's own locale and time zone, so the empty feed above it reads as the reset's.
export function ResetMarker(props: ResetMarkerProps): ReactNode {
  return (
    <li>
      <p aria-label="reset" className={markerRule} role="note">
        Reset at {formatResetTime(props.record.recordedAt)}
      </p>
    </li>
  );
}

function formatResetTime(date: Date): string {
  return date.toLocaleString(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  });
}
