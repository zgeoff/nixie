import type { ReactNode } from 'react';
import { css } from '../styled-system/css';

const badge = css({
  borderColor: 'border',
  borderRadius: 'sm',
  borderWidth: '1px',
  color: 'textMuted',
  fontSize: 'xs',
  marginInlineEnd: '1',
  paddingInline: '1',
});

export function SelfNoteBadge(): ReactNode {
  return <span className={badge}>self-note</span>;
}
