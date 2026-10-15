import type { ReactNode } from 'react';
import type { SummaryActivity } from '../build-activity';
import { formatSummary } from '../format-summary';
import { css, cx } from '../styled-system/css';
import { markerRule } from './marker-rule';

export interface SummaryMarkerProps {
  readonly summary: SummaryActivity;
}

// A rule across the feed where nixie closed the session with a summary, with its sizes. It starts
// closed, as the same rule as a compaction marker, and opening it shows the summary the next
// session opened with, while a forget has not erased it.
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
      <summary className={cx(markerRule, css({ cursor: 'pointer' }))}>{line}</summary>
      <p className={css({ whiteSpace: 'pre-wrap', paddingBlock: '2' })}>{props.summary.text}</p>
    </details>
  );
}
