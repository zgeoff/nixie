import type { DeviceEvent } from '@heynixie/contract';
import { deviceEventSchema } from '@heynixie/contract';
import { z } from 'zod';
import type { DeviceEvents, PageDataNotice, PageDelivery, ScreenEvent } from './types';

// What the tabs of one browser tell each other about the one device stream. A tab that joins asks
// for what the stream shows, a probe asks whether a holder is still there, and the holder answers
// with what its stream shows, or with `here`.
export type DeviceRelayMessage =
  | { readonly kind: 'join' }
  | { readonly kind: 'probe' }
  | { readonly kind: 'here'; readonly tab: string }
  | { readonly kind: 'resign'; readonly tab: string }
  | { readonly kind: 'leader'; readonly tab: string; readonly events: DeviceEvents };

const numberedEventSchema = z.intersection(deviceEventSchema, z.object({ id: z.int() }));

const relayedEventsSchema = z.object({
  event: deviceEventSchema.nullable(),
  layout: z.unknown(),
  messages: z.array(numberedEventSchema),
  notices: z.array(numberedEventSchema),
  lastMessageID: z.int(),
  lastNoticeID: z.int(),
  connection: z.enum(['connecting', 'open', 'lost', 'refused']),
});

const relayMessageSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('join') }),
  z.object({ kind: z.literal('probe') }),
  z.object({ kind: z.literal('here'), tab: z.string() }),
  z.object({ kind: z.literal('resign'), tab: z.string() }),
  z.object({ kind: z.literal('leader'), tab: z.string(), events: relayedEventsSchema }),
]);

// Another tab may run another release of the client, so a message that does not parse is null.
export function parseDeviceRelayMessage(data: unknown): DeviceRelayMessage | null {
  const parsed = relayMessageSchema.safeParse(data);

  if (!parsed.success) {
    return null;
  }

  const message = parsed.data;

  if (message.kind !== 'leader') {
    return message;
  }

  const events = message.events;
  const layout = deviceEventSchema.safeParse({ kind: 'layout', layout: events.layout });
  const event = events.event;

  if (
    !layout.success ||
    layout.data.kind !== 'layout' ||
    (event !== null && !isScreenEvent(event))
  ) {
    return null;
  }

  return {
    kind: 'leader',
    tab: message.tab,
    events: {
      event,
      layout: layout.data.layout,
      messages: events.messages.filter((item) => isPageDelivery(item)),
      notices: events.notices.filter((item) => isPageDataNotice(item)),
      lastMessageID: events.lastMessageID,
      lastNoticeID: events.lastNoticeID,
      connection: events.connection,
    },
  };
}

function isScreenEvent(event: DeviceEvent): event is ScreenEvent {
  return event.kind === 'show' || event.kind === 'idle';
}

function isPageDelivery(item: DeviceEvent & { readonly id: number }): item is PageDelivery {
  return item.kind === 'message';
}

function isPageDataNotice(item: DeviceEvent & { readonly id: number }): item is PageDataNotice {
  return item.kind === 'data';
}
