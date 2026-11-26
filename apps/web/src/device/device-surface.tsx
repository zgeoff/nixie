import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { LayoutView } from './layout-view';
import { pickSurface } from './pick-surface';
import { ScreenView } from './screen-view';
import type { DeviceEvents } from './use-device-events';

export interface DeviceSurfaceProps {
  readonly events: DeviceEvents;

  // called when a page's frame sees a touch, which its own window keeps from the device page
  readonly onTouch?: () => void;
}

const area = css({ height: '100%', position: 'relative', width: '100%' });

// a layout that a show or the idle scene covers: it stays loaded at its size, so a page keeps running
const covered = css({
  inset: '0',
  pointerEvents: 'none',
  position: 'absolute',
  visibility: 'hidden',
});

// What the stream says the screen shows, at the size of the box around it. A show covers the layout,
// which gives way to the idle scene while every region is blank.
export function DeviceSurface(props: DeviceSurfaceProps): ReactNode {
  const events = props.events;
  const surface = pickSurface(events.event, events.layout);

  return (
    <div className={area}>
      {events.layout === null ? null : (
        <div className={surface.kind === 'layout' ? area : covered}>
          <LayoutView
            layout={events.layout}
            messages={events.messages}
            notices={events.notices}
            {...(props.onTouch === undefined ? {} : { onTouch: props.onTouch })}
          />
        </div>
      )}
      {surface.kind === 'layout' ? null : <ScreenView blocks={surface.blocks} />}
    </div>
  );
}
