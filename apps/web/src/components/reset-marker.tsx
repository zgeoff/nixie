import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import type { LiveRecord } from '../use-live-records';
import { markerRule } from './marker-rule';

export interface ResetMarkerProps {
  readonly record: LiveRecord;
}

// The server knows neither the browser's locale nor its time zone, so the server render and
// hydration leave the time out, and the browser adds it.
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
