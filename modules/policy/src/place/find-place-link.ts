import type { LogRecord } from '@heynixie/log';
import { z } from 'zod';

// The IDs of the place that a removal or an act record names, from its payload for a site or mail
// domain, or from its erasable fields for an address, phone or handle. Null once a forget shredded
// those fields.
export interface PlaceLink {
  readonly placeID: string;
  readonly shortID: string | null;
}

const linkSchema = z.object({ placeID: z.string(), shortID: z.string().exactOptional() });

export function findPlaceLink(record: Pick<LogRecord, 'payload' | 'erasable'>): PlaceLink | null {
  const open = linkSchema.safeParse(record.payload);

  if (open.success) {
    return { placeID: open.data.placeID, shortID: open.data.shortID ?? null };
  }

  if (record.erasable.status !== 'readable') {
    return null;
  }

  const sealed = linkSchema.safeParse(record.erasable.fields);

  return sealed.success
    ? { placeID: sealed.data.placeID, shortID: sealed.data.shortID ?? null }
    : null;
}
