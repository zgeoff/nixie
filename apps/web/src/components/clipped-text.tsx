import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';

export interface ClippedTextProps {
  readonly text: string;
}

const clipLength = 600;

// A page's text can run to many kilobytes, so a long value shows its start and opens in full on
// demand. Its toggle sticks to the top of the view until its own text ends, so an open value
// closes again without a scroll back to find the control.

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
