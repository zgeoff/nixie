import type { RegionContent } from '@heynixie/contract';
import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { formatClock } from './format-clock';
import { formatCountdown } from './format-countdown';
import { useNow } from './use-now';

export interface LiveValueProps {
  readonly content: Extract<RegionContent, { kind: 'live' }>;
}

const value = css({
  alignItems: 'center',
  display: 'flex',
  flexDirection: 'column',
  fontSize: '6xl',
  fontVariantNumeric: 'tabular-nums',
  height: '100%',
  justifyContent: 'center',
  width: '100%',
});

const label = css({ fontSize: '2xl', opacity: '0.7' });

// A clock or a countdown that the page keeps fresh by itself, from the browser's own time.
export function LiveValue(props: LiveValueProps): ReactNode {
  const nowMs = useNow();
  const content = props.content;

  if (content.live === 'clock') {
    return (
      <div className={value} data-live="clock">
        {formatClock(nowMs, content.format)}
      </div>
    );
  }

  return (
    <div className={value} data-live="countdown">
      {content.label === undefined ? null : <div className={label}>{content.label}</div>}
      {formatCountdown(Date.parse(content.to), nowMs)}
    </div>
  );
}
