import type { ReactNode } from 'react';
import type { LiveRecord } from '../use-live-records';
import { markerRule } from './marker-rule';

export interface StopMarkerProps {
  readonly stop: NonNullable<LiveRecord['stop']>;
}

export function StopMarker(props: StopMarkerProps): ReactNode {
  const tools = props.stop.cancelledActions.map((action) => action.tool);

  return (
    <li>
      <p aria-label="stop" className={markerRule} role="note">
        {tools.length === 0 ? 'Stopped' : `Stopped, and cancelled ${tools.join(', ')}`}
      </p>
    </li>
  );
}
