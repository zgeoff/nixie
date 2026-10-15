import { css } from '../styled-system/css';

// A rule across the feed with a short line of facts at its middle, which every marker of the
// session shares, so a summary marker sits in the feed as a compaction marker does.
export const markerRule = css({
  _after: { borderTopWidth: '1px', content: '""', flex: '1' },
  _before: { borderTopWidth: '1px', content: '""', flex: '1' },
  alignItems: 'center',
  color: 'textMuted',
  display: 'flex',
  fontSize: 'xs',
  gap: '2',
  paddingBlock: '1',
});
