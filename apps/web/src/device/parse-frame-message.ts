import {
  isJSONWithin,
  pageDataSchema,
  pageEventDataLimitBytes,
  pageEventNameLimit,
} from '@heynixie/contract';
import type { PageData } from '@heynixie/contract';
import { z } from 'zod';

const frameMessageSchema = z.discriminatedUnion('type', [
  z.object({ nixie: z.literal(true), type: z.literal('ready') }),
  z.object({ nixie: z.literal(true), type: z.literal('touch') }),
  z.object({ nixie: z.literal(true), type: z.literal('error'), message: z.string() }),
  z.object({
    nixie: z.literal(true),
    type: z.literal('event'),
    name: z.string().min(1).max(pageEventNameLimit),
    data: pageDataSchema.optional(),
    wake: z.boolean(),
  }),
]);

export type FrameMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'touch' }
  | { readonly type: 'error'; readonly message: string }
  | {
      readonly type: 'event';
      readonly name: string;
      readonly data: PageData | undefined;
      readonly wake: boolean;
    };

export type ParsedFrameMessage =
  | { readonly status: 'message'; readonly message: FrameMessage }
  | { readonly status: 'refused'; readonly reason: string }
  | { readonly status: 'ignored' };

// What a page's bridge posted to the device page. A value that is no bridge message is ignored, and
// an event that breaks the bridge's own limits is refused with a reason that the page's errors
// show, so the assistant learns why nothing arrived.
export function parseFrameMessage(raw: unknown): ParsedFrameMessage {
  const parsed = frameMessageSchema.safeParse(raw);

  if (!parsed.success) {
    return isBridgeEvent(raw)
      ? { status: 'refused', reason: 'nixie.send needs a name of 1 to 64 characters and JSON data' }
      : { status: 'ignored' };
  }

  const message = parsed.data;

  if (message.type === 'event') {
    if (message.data !== undefined && !isJSONWithin(message.data, pageEventDataLimitBytes)) {
      return { status: 'refused', reason: 'nixie.send data is over 2 KiB' };
    }

    return {
      status: 'message',
      message: { type: 'event', name: message.name, data: message.data, wake: message.wake },
    };
  }

  if (message.type === 'error') {
    return { status: 'message', message: { type: 'error', message: message.message } };
  }

  return { status: 'message', message: { type: message.type } };
}

function isBridgeEvent(raw: unknown): boolean {
  return z.object({ nixie: z.literal(true), type: z.literal('event') }).safeParse(raw).success;
}
