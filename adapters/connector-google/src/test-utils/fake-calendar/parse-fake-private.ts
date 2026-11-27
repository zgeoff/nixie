import { z } from 'zod';
import type { StoredEvent } from './types';

const privateSchema = z.object({ private: z.record(z.string(), z.string()).optional() });

// The private properties of a stored event.
export function parseFakePrivate(event: StoredEvent): Record<string, string> {
  const parsed = privateSchema.safeParse(event['extendedProperties']);

  return parsed.success ? { ...parsed.data.private } : {};
}
