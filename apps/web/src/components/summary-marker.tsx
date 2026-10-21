import type { ReactNode } from 'react';
import type { SummaryActivity } from '../build-activity';
import { formatSummary } from '../format-summary';
import { css, cx } from '../styled-system/css';
import { markerRule } from './marker-rule';

export interface SummaryMarkerProps {
  readonly summary: SummaryActivity;
}

export function SummaryMarker(props: SummaryMarkerProps): ReactNode {
  const line = formatSummary(props.summary);

  if (props.summary.text === undefined) {
    return (
      <p aria-label="summary" className={markerRule} role="note">
        {line}
      </p>
    );
  }

  return (
    <details aria-label="summary" role="note">
      <summary className={cx(markerRule, css({ cursor: 'pointer' }))}>
        <span
          aria-hidden="true"
          className={css({
            'details[open] > summary > &': { transform: 'rotate(90deg)' },
            fontSize: '2xs',
            lineHeight: '1',
          })}
        >
          ▸
        </span>
        <span>{line}</span>
      </summary>
      <p className={css({ whiteSpace: 'pre-wrap', paddingBlock: '2' })}>{props.summary.text}</p>
    </details>
  );
}
