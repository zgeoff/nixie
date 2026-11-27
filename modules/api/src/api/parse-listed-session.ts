import { listedSessionSchema } from '@heynixie/contract';
import type { JSONObject } from '@heynixie/log';
import { z } from 'zod';

type ListedSession = z.output<typeof listedSessionSchema>;

const sessionFieldSchema = z.object({
  session: z.object({
    isReleased: z.boolean(),
    lastEventAt: z.number().nullable(),
    origin: listedSessionSchema.shape.origin,
    state: listedSessionSchema.shape.state,
  }),
});

// The session that a task's runner lists for it, or undefined for a runner that lists none.
export function parseListedSession(fields: JSONObject | undefined): ListedSession | undefined {
  const parsed = sessionFieldSchema.safeParse(fields);

  if (!parsed.success) {
    return undefined;
  }

  const session = parsed.data.session;

  return {
    isReleased: session.isReleased,
    lastEventAt: session.lastEventAt === null ? null : new Date(session.lastEventAt),
    origin: session.origin,
    state: session.state,
  };
}
