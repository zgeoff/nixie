import { z } from 'zod';

// The sandbox section of the deployment configuration: the adapter that runs every sandbox. imp
// runs each one as a microVM, and test runs each guest as a local process with no isolation, for a
// preview or a test. Only a test build holds the test sandbox, so a release refuses test at start.
export const sandboxConfigSchema = z
  .strictObject({ adapter: z.enum(['imp', 'test']).default('imp') })
  .refine((config) => NIXIE_TEST_BUILD || config.adapter !== 'test', {
    path: ['adapter'],
    message: 'only a test build holds the test sandbox, so a release runs every sandbox in an imp',
  });
