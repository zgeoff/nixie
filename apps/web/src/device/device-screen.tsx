import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import { css } from '../styled-system/css';
import { DeviceSurface } from './device-surface';
import { FullscreenButton } from './fullscreen-button';
import { useDeviceFeed } from './use-device-feed';
import { useRevealOnTouch } from './use-reveal-on-touch';
import { useWakeLock } from './use-wake-lock';
import { useWindowPixels } from './use-window-pixels';

export interface DeviceScreenProps {
  readonly onClose: () => void;
  readonly onSwitchOff: () => void;
  readonly onSignOut: () => void;
}

const fullViewport = css({ inset: '0', position: 'fixed' });

const controls = css({
  display: 'flex',
  gap: '2',
  insetBlockEnd: '2',
  insetInlineEnd: '2',
  position: 'fixed',
  '& button': {
    backgroundColor: 'black',
    borderColor: 'white',
    borderWidth: '1px',
    color: 'white',
    fontSize: 'sm',
    paddingBlock: '1',
    paddingInline: '3',
  },
});

// The screen while it is on: what the stream says it shows, with the screen kept awake as long as
// a stream is open. Its buttons show for a few seconds after a touch or a pointer move. A show
// covers the layout, which gives way to the idle scene while every region is blank.
export function DeviceScreen(props: DeviceScreenProps): ReactNode {
  const feed = useDeviceFeed();
  const events = useSyncExternalStore(feed.subscribe, feed.getSnapshot, feed.getSnapshot);

  useWakeLock(events.connection === 'open');
  useWindowPixels();

  const touch = useRevealOnTouch();

  return (
    <>
      <div className={fullViewport}>
        <DeviceSurface events={events} onTouch={touch.reveal} />
      </div>
      <div className={controls} style={{ visibility: touch.isRevealed ? 'visible' : 'hidden' }}>
        <button onClick={props.onClose} type="button">
          Close
        </button>
        <FullscreenButton />
        <button onClick={props.onSwitchOff} type="button">
          Switch off screen
        </button>
        <button onClick={props.onSignOut} type="button">
          Sign out
        </button>
      </div>
    </>
  );
}
