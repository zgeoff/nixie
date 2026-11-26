import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import { useCall } from './call-context';

const group = css({ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '2' });

const button = css({
  borderColor: 'borderStrong',
  borderRadius: 'md',
  borderWidth: '1px',
  cursor: 'pointer',
  fontSize: 'sm',
  paddingBlock: '1',
  paddingInline: '3',
  _disabled: { cursor: 'default', opacity: 0.5 },
});

// Mute and hang up, for the call screen and the call bar.
export function CallControls(): ReactNode {
  const call = useCall();
  const [isHangingUp, setIsHangingUp] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  const hangUp = async (): Promise<void> => {
    setIsHangingUp(true);
    setHasFailed(false);

    try {
      await call.session.hangUp();
    } catch {
      setHasFailed(true);
    }

    setIsHangingUp(false);
  };

  return (
    <div className={group}>
      <button
        aria-pressed={call.snapshot.isMuted}
        className={button}
        name="mute"
        onClick={call.session.toggleMute}
        type="button"
      >
        {call.snapshot.isMuted ? 'Unmute' : 'Mute'}
      </button>
      <button
        className={button}
        disabled={isHangingUp}
        name="hang-up"
        onClick={() => {
          void hangUp();
        }}
        type="button"
      >
        Hang up
      </button>
      {hasFailed ? <span role="alert">The hang up did not finish. Try again.</span> : null}
    </div>
  );
}
