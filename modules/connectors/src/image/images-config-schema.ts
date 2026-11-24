import { z } from 'zod';

const priceSchema = z.number().int().positive();

const imageProfileSchema = z.strictObject({
  provider: z.enum(['openai', 'gemini']),
  model: z.string().min(1),
  credential: z.string().regex(/^deployment:.+$/u, 'use deployment:<name>'),

  // micros per image, one for each size the tools draw
  prices: z.strictObject({
    '1024x1024': priceSchema,
    '1536x1024': priceSchema,
    '1024x1536': priceSchema,
  }),
});

export const imagesConfigSchema = z
  .strictObject({
    default: z.string().min(1).default('openai'),
    profiles: z.record(z.string().min(1), imageProfileSchema),
  })
  .refine((images) => Object.hasOwn(images.profiles, images.default), {
    message: 'images.default must name a key of images.profiles',
    path: ['default'],
  });

export type ImagesConfig = z.infer<typeof imagesConfigSchema>;

export type ImageProfile = z.infer<typeof imageProfileSchema>;
