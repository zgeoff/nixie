import type { DeviceEvent } from '@heynixie/contract';
import type { DeviceEvents, PageDelivery } from './use-device-events';

export function applyDeviceEvent(current: DeviceEvents, event: DeviceEvent): DeviceEvents {
  if (event.kind === 'layout') {
    return { ...current, layout: event.layout };
  }

  if (event.kind === 'message') {
    const id = (current.messages.at(-1)?.id ?? 0) + 1;

    return { ...current, messages: trimMessages([...current.messages, { ...event, id }]) };
  }

  return { ...current, event };
}

// the most messages the device keeps, so a page that gets many never grows the list for good
const messageLimit = 200;

// Keeps the 200 newest messages, and with them each region's newest retained message however old
// it is, because a frame that loads again on the same stream starts from that message.
function trimMessages(messages: readonly PageDelivery[]): readonly PageDelivery[] {
  if (messages.length <= messageLimit) {
    return messages;
  }

  const newestRetained = new Map<string, PageDelivery>();

  for (const message of messages) {
    if (message.retain) {
      newestRetained.set(message.region, message);
    }
  }

  const recent = new Set(messages.slice(-messageLimit));
  const kept = new Set(newestRetained.values());

  return messages.filter((message) => recent.has(message) || kept.has(message));
}
