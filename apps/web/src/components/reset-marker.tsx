import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import type { LiveRecord } from '../use-live-records';
import { markerRule } from './marker-rule';

export interface ResetMarkerProps {
  readonly record: LiveRecord;
}

// A rule at the top of the feed where a reset removed every earlier record, with the time it ran
// in the browser's locale and time zone. The server knows neither, so its render and hydration
// leave the time out, and the browser adds it.
export function ResetMarker(props: ResetMarkerProps): ReactNode {
  const isHydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  return (
    <li>
      <p aria-label="reset" className={markerRule} role="note">
        {isHydrated ? `Reset at ${formatResetTime(props.record.recordedAt)}` : 'Reset'}
      </p>
    </li>
  );
}

// whether the page hydrated never changes once it has, so there is nothing to listen to
function subscribeToNothing(): () => void {
  return () => {};
}

function formatResetTime(date: Date): string {
  return date.toLocaleString(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  });
}
