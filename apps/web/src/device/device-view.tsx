import type { ReactNode } from 'react';
import { useRef, useSyncExternalStore } from 'react';
import { css } from '../styled-system/css';
import { DeviceSurface } from './device-surface';
import { useDeviceFeed } from './use-device-feed';
import { useViewPixels } from './use-view-pixels';

const page = css({
  height: 'calc(100dvh - token(sizes.appBar))',
  position: 'relative',
  width: '100%',
});

const status = css({
  backgroundColor: 'black',
  color: 'white',
  fontSize: 'sm',
  insetBlockStart: '2',
  insetInlineStart: '2',
  paddingBlock: '1',
  paddingInline: '3',
  position: 'absolute',
  zIndex: '1',
});

// This client's own device, drawn at the size of the page's content area. It reads the device
// stream that the tab holds, so it shows what the assistant put on the screen while the page was
// closed, and the page never tells the user when that content changes.
export function DeviceView(): ReactNode {
  const feed = useDeviceFeed();
  const events = useSyncExternalStore(feed.subscribe, feed.getSnapshot, feed.getSnapshot);
  const area = useRef<HTMLDivElement>(null);

  useViewPixels(area);

  return (
    <section aria-label="Device view" className={page} ref={area}>
      {events.connection === 'open' ? null : (
        <p className={status} role="status">
          {events.connection === 'refused'
            ? 'This device is not available.'
            : 'Connecting to this device.'}
        </p>
      )}
      <DeviceSurface events={events} />
    </section>
  );
}
