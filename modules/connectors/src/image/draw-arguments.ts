import { z } from 'zod';
import { imageSizes } from './image-size';

export const drawArguments = z.object({
  prompt: z.string(),
  size: z.enum(imageSizes).optional(),
  from: z.string().optional(),
  profile: z.string().optional(),
  references: z.array(z.string()).default([]),
});

export type DrawArguments = z.infer<typeof drawArguments>;
