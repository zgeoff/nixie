import { z } from 'zod';
import type { StoredEvent } from './types';

const timeSchema = z.object({ date: z.string().optional(), dateTime: z.string().optional() });

// The start of a stored event in epoch ms; NaN when it has none.
export function parseFakeStart(event: StoredEvent): number {
  const start = timeSchema.safeParse(event['start']);
  const text = start.success ? (start.data.dateTime ?? start.data.date ?? '') : '';

  return Date.parse(text);
}
