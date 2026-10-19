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

// The mark on an item or a proposal that nixie wrote about itself, where it sits among facts.
export function SelfNoteBadge(): ReactNode {
  return <span className={badge}>self-note</span>;
}
