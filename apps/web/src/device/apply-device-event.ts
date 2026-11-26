import type { DeviceEvent } from '@heynixie/contract';
import type { DeviceEvents, PageDelivery } from './types';

// the most refresh notices the device keeps, which a page that hears them all has read
const noticeLimit = 100;

export function applyDeviceEvent(current: DeviceEvents, event: DeviceEvent): DeviceEvents {
  if (event.kind === 'layout') {
    return {
      ...current,
      layout: event.layout,
      messages: keepShownMessages(current, event.layout),
      notices: current.notices.filter(
        (notice) =>
          event.layout?.regions.some(
            (region) => region.name === notice.region && region.shown === notice.shown,
          ) === true,
      ),
    };
  }

  if (event.kind === 'message') {
    const id = current.lastMessageID + 1;

    return {
      ...current,
      lastMessageID: id,
      messages: trimMessages([...current.messages, { ...event, id }]),
    };
  }

  if (event.kind === 'data') {
    const id = current.lastNoticeID + 1;

    return {
      ...current,
      lastNoticeID: id,
      notices: [...current.notices, { ...event, id }].slice(-noticeLimit),
    };
  }

  return { ...current, event };
}

// A region that shows other content has lost the page's state, which the server dropped, so no
// message of that page may reach a frame that the same content gets later, such as the page that
// a temporary replacement gave back.
function keepShownMessages(
  current: DeviceEvents,
  layout: DeviceEvents['layout'],
): readonly PageDelivery[] {
  return current.messages.filter(
    (message) =>
      layout?.regions.some(
        (region) => region.name === message.region && region.shown === message.shown,
      ) === true,
  );
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
