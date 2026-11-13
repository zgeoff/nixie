import { z } from 'zod';
import { effectNames } from './effect-names';

const overrideSchema = z
  .strictObject({
    add: z.array(z.enum(effectNames)).default([]),
    remove: z.array(z.enum(effectNames)).default([]),
  })
  .refine((override) => override.add.length + override.remove.length > 0, {
    message: 'an override adds or removes at least one effect',
  })
  .refine((override) => !override.add.some((effect) => override.remove.includes(effect)), {
    message: 'an effect is in both add and remove',
  });

export const effectOverridesFileSchema = z.record(z.string().min(1), overrideSchema);
