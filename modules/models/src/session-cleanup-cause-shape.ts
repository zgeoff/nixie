import { z } from 'zod';

// What made nixie clean up the conversation's session: the forget of an item or of a record. A
// cause names one of the two.
export const sessionCleanupCauseShape = {
  itemID: z.string().exactOptional(),
  recordSequence: z.int().exactOptional(),
};
