import type { ReactNode } from 'react';
import type { SummaryActivity } from '../build-activity';
import { formatSummary } from '../format-summary';
import { css } from '../styled-system/css';

export interface SummaryMarkerProps {
  readonly summary: SummaryActivity;
}

// A rule across the feed where nixie closed the session with a summary, with its sizes. Opening it
// shows the summary the next session opened with, while a forget has not erased it.
export function SummaryMarker(props: SummaryMarkerProps): ReactNode {
  const line = formatSummary(props.summary);

  if (props.summary.text === undefined) {
    return (
      <p aria-label="summary" className={rule} role="note">
        {line}
      </p>
    );
  }

  return (
    <details aria-label="summary" role="note">
      <summary className={rule}>{line}</summary>
      <p className={css({ whiteSpace: 'pre-wrap', paddingBlock: '2' })}>{props.summary.text}</p>
    </details>
  );
}

const rule = css({
  _after: { borderTopWidth: '1px', content: '""', flex: '1' },
  _before: { borderTopWidth: '1px', content: '""', flex: '1' },
  alignItems: 'center',
  color: 'textMuted',
  cursor: 'pointer',
  display: 'flex',
  fontSize: 'xs',
  gap: '2',
  paddingBlock: '1',
});
