import { z } from 'zod';

const messageRefSchema = z.object({ id: z.string() });

// The answer of `messages.list`: the IDs of one page and the token of the next.
export const listMessagesSchema = z.object({
  messages: z.array(messageRefSchema).exactOptional(),
  nextPageToken: z.string().exactOptional(),
});
