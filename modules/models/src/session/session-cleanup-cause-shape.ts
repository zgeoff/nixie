import { z } from 'zod';

export const sessionCleanupCauseShape = {
  itemID: z.string().exactOptional(),
  recordSequence: z.int().exactOptional(),
  momentID: z.string().exactOptional(),
  noteID: z.string().exactOptional(),
  connectionID: z.string().exactOptional(),
  textID: z.string().exactOptional(),
};
