import type { RegionContent } from '@heynixie/contract';
import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { FitBox } from './fit-box';
import { formatClock } from './format-clock';
import { formatCountdown } from './format-countdown';
import { useNow } from './use-now';

export interface LiveValueProps {
  readonly content: Extract<RegionContent, { kind: 'live' }>;
}

const value = css({ fontVariantNumeric: 'tabular-nums' });
const label = css({ fontSize: '0.4em', opacity: '0.7' });

// A clock or a countdown that the page keeps fresh by itself, from the browser's own time, as large
// as its region allows.
export function LiveValue(props: LiveValueProps): ReactNode {
  const nowMs = useNow();
  const content = props.content;

  if (content.live === 'clock') {
    const text = formatClock(nowMs, content.format);

    return (
      <FitBox fitKey={text} isCentred>
        <div className={value} data-live="clock">
          {text}
        </div>
      </FitBox>
    );
  }

  const countdown = formatCountdown(Date.parse(content.to), nowMs);

  return (
    <FitBox fitKey={`${content.label ?? ''}|${countdown}`} isCentred>
      <div className={value} data-live="countdown">
        {content.label === undefined ? null : <div className={label}>{content.label}</div>}
        {countdown}
      </div>
    </FitBox>
  );
}
