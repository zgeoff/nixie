import type { JSONValue } from '@heynixie/connections';
import { z } from 'zod';

const entrySchema = z.strictObject({
  historyID: z.string(),
  polledAt: z.number(),
  replayed: z.array(z.string()).default([]),
});

const cursorSchema = z.record(z.string(), entrySchema);

// The source's cursor in trigger_sources: one entry per connection, by connection ID. `polledAt` is
// the start of the connection's last good poll, epoch ms. `replayed` holds the ID of each reply rule
// whose mail since its send a committed poll has read again.
export type GmailSourceCursor = Readonly<z.infer<typeof cursorSchema>>;

// The stored cursor, or an empty one when none is stored or the stored one is unreadable, which
// polls each connection afresh.
export function parseGmailSourceCursor(value: JSONValue): GmailSourceCursor {
  const parsed = cursorSchema.safeParse(value);

  return parsed.success ? parsed.data : {};
}
