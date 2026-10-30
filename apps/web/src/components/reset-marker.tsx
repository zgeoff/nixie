import type { ReactNode } from 'react';
import { useIsHydrated } from '../use-is-hydrated';
import type { LiveRecord } from '../use-live-records';
import { markerRule } from './marker-rule';

export interface ResetMarkerProps {
  readonly record: LiveRecord;
}

export function ResetMarker(props: ResetMarkerProps): ReactNode {
  const isHydrated = useIsHydrated();

  return (
    <li>
      <p aria-label="reset" className={markerRule} role="note">
        {isHydrated ? `Reset at ${formatResetTime(props.record.recordedAt)}` : 'Reset'}
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
