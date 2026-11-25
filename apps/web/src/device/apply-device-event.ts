import type { DeviceEvent } from '@heynixie/contract';
import type { DeviceEvents } from './use-device-events';

// the most messages the device keeps, so a page that gets many never grows the list for good
const messageLimit = 200;

export function applyDeviceEvent(current: DeviceEvents, event: DeviceEvent): DeviceEvents {
  if (event.kind === 'layout') {
    return { ...current, layout: event.layout };
  }

  if (event.kind === 'message') {
    const id = (current.messages.at(-1)?.id ?? 0) + 1;

    return { ...current, messages: [...current.messages, { ...event, id }].slice(-messageLimit) };
  }

  return { ...current, event };
}
