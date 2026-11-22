import type { DeviceEvent, ScreenContent } from '@heynixie/contract';
import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { FullscreenButton } from './fullscreen-button';
import { ScreenView } from './screen-view';
import { useDeviceEvents } from './use-device-events';
import { useScreenResize } from './use-screen-resize';
import { useWakeLock } from './use-wake-lock';

export interface DeviceScreenProps {
  readonly onSwitchOff: () => void;
  readonly onSignOut: () => void;
}

const controls = css({
  display: 'flex',
  gap: '2',
  insetBlockEnd: '2',
  insetInlineEnd: '2',
  opacity: '0.3',
  position: 'fixed',
  _focusWithin: { opacity: '1' },
  _hover: { opacity: '1' },
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
// a stream is open.
export function DeviceScreen(props: DeviceScreenProps): ReactNode {
  const events = useDeviceEvents(true);

  useWakeLock(events.connection === 'open');
  useScreenResize(true);

  const event = events.event;
  const blocks = pickBlocks(event);

  return (
    <>
      <ScreenView blocks={blocks} />
      <div className={controls}>
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

function pickBlocks(event: DeviceEvent | null): ScreenContent[] {
  if (event === null) {
    return [];
  }

  return event.kind === 'show' ? [event.content] : event.scene;
}
