import type { ReactNode } from 'react';
import type { WholePayloads } from '../conversation/use-whole-payloads';
import { css } from '../styled-system/css';

export interface WholeValueControlProps {
  readonly whole: WholePayloads;
}

const quiet = css({ color: 'textMuted', fontSize: 'sm' });

// Shown beside a value that the server cut. Once the whole value of every cut record loads, the control is gone and the
// value shows in place of the cut one.
export function WholeValueControl(props: WholeValueControlProps): ReactNode {
  const whole = props.whole;

  if (whole.isLoaded) {
    return null;
  }

  return (
    <p className={quiet}>
      This value is cut to its first 4,096 bytes.{' '}
      <button
        disabled={whole.isLoading}
        name="load-whole-value"
        onClick={whole.onLoad}
        type="button"
      >
        {whole.failure === null ? 'Load the whole value' : 'Try again'}
      </button>
      {whole.failure === null ? null : <span role="alert"> {whole.failure}</span>}
    </p>
  );
}
