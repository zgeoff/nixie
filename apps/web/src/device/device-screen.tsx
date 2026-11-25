import type { ReactNode } from 'react';
import { useRef } from 'react';
import { css } from '../styled-system/css';
import { FullscreenButton } from './fullscreen-button';
import { LayoutView } from './layout-view';
import { pickSurface } from './pick-surface';
import { readScreenPixels } from './read-screen-pixels';
import { ScreenView } from './screen-view';
import { useDeviceEvents } from './use-device-events';
import { useRevealOnTouch } from './use-reveal-on-touch';
import { useScreenResize } from './use-screen-resize';
import { useWakeLock } from './use-wake-lock';

export interface DeviceScreenProps {
  readonly onClose: () => void;
  readonly onSwitchOff: () => void;
  readonly onSignOut: () => void;
}

// a layout that a show or the idle scene covers: it stays loaded at its size, so a page keeps running
const covered = css({
  inset: '0',
  pointerEvents: 'none',
  position: 'fixed',
  visibility: 'hidden',
});

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
  const serverPixels = useRef(readScreenPixels());
  const events = useDeviceEvents(true, serverPixels);

  useWakeLock(events.connection === 'open');
  useScreenResize(true, serverPixels);

  const touch = useRevealOnTouch();
  const surface = pickSurface(events.event, events.layout);

  return (
    <>
      {events.layout === null ? null : (
        <div className={surface.kind === 'layout' ? undefined : covered}>
          <LayoutView layout={events.layout} messages={events.messages} onTouch={touch.reveal} />
        </div>
      )}
      {surface.kind === 'layout' ? null : <ScreenView blocks={surface.blocks} />}
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
