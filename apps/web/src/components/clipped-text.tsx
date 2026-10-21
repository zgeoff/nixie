import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';

export interface ClippedTextProps {
  readonly text: string;
}

const clipLength = 600;

export function ClippedText(props: ClippedTextProps): ReactNode {
  const [isOpen, setIsOpen] = useState(false);
  const isLong = props.text.length > clipLength;

  return (
    <div>
      {isLong ? (
        <button
          className={css({
            backgroundColor: 'canvas',
            display: 'block',
            position: 'sticky',
            textDecoration: 'underline',
            top: '0',
          })}
          onClick={() => {
            setIsOpen(!isOpen);
          }}
          type="button"
        >
          {isOpen ? 'Show less' : `Show all ${props.text.length.toLocaleString('en')} characters`}
        </button>
      ) : null}
      <pre className={css({ overflowX: 'auto', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' })}>
        {isLong && !isOpen ? `${props.text.slice(0, clipLength)}…` : props.text}
      </pre>
    </div>
  );
}
