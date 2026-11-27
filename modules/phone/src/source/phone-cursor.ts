import { z } from 'zod';

// Where the source stands in the provider's list: texts received after `since` are new, and so are
// texts received at `since` whose message ID is not in `skip`.
export const phoneCursorSchema = z.strictObject({
  since: z.int().nonnegative(),
  skip: z.array(z.string()),
});

export type PhoneCursor = z.output<typeof phoneCursorSchema>;
