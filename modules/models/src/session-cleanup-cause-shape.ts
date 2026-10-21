import { z } from 'zod';

export const sessionCleanupCauseShape = {
  itemID: z.string().exactOptional(),
  recordSequence: z.int().exactOptional(),
};
