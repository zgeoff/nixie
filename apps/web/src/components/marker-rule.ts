import { css } from '../styled-system/css';

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
