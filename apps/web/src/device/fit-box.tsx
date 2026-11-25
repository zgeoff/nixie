import type { ReactNode } from 'react';
import { useRef } from 'react';
import { css } from '../styled-system/css';
import { useFitText } from './use-fit-text';

export interface FitBoxProps {
  // changes whenever the content does, so the text fits again
  readonly fitKey: string;
  readonly isCentred: boolean;
  readonly children: ReactNode;
}

const box = css({ height: '100%', overflow: 'hidden', width: '100%' });
const centred = css({ alignItems: 'center', display: 'flex' });
const content = css({ width: '100%' });
const oneLine = css({ textAlign: 'center', whiteSpace: 'nowrap' });

// Text that grows to fill its region: the largest size at which it fits, kept as the region or the
// text changes.
export function FitBox(props: FitBoxProps): ReactNode {
  const container = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);

  useFitText(container, text, props.fitKey);

  return (
    <div className={props.isCentred ? `${box} ${centred}` : box} data-fit="box" ref={container}>
      <div className={props.isCentred ? `${content} ${oneLine}` : content} ref={text}>
        {props.children}
      </div>
    </div>
  );
}
