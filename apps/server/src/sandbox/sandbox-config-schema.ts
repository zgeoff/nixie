import { z } from 'zod';

export const sandboxConfigSchema = z
  .strictObject({ adapter: z.enum(['imp', 'test']).default('imp') })
  .refine((config) => NIXIE_TEST_BUILD || config.adapter !== 'test', {
    path: ['adapter'],
    message: 'only a test build holds the test sandbox, so a release runs every sandbox in an imp',
  });
