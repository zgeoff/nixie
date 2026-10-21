import type { ReactNode } from 'react';
import { css } from '../styled-system/css';

export interface StepSectionProps {
  readonly children: ReactNode;
  readonly title: string;

  readonly onToggle?: (isOpen: boolean) => void;
}

export function StepSection(props: StepSectionProps): ReactNode {
  return (
    <details
      aria-label={props.title}
      onToggle={(event) => {
        props.onToggle?.(event.currentTarget.open);
      }}
    >
      <summary className={css({ cursor: 'pointer', fontWeight: 'semibold' })}>
        {props.title}
      </summary>
      <div className={css({ paddingInlineStart: '4' })}>{props.children}</div>
    </details>
  );
}
