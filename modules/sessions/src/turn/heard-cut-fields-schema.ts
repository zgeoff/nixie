import { z } from 'zod';

// The fields of a call's cut record that a conversation's history reads.
export const heardCutFieldsSchema = z.object({
  replyRecordID: z.string(),
  heardChars: z.int().nonnegative(),
});
