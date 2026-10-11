import { modelsConfigSchema } from '@heynixie/models';
import { z } from 'zod';

// The deployment configuration, composed from one schema per module for the section it reads.
// The root refuses an unknown key, so a typo never passes as a default, and a later slice adds
// its section here.
export const deploymentConfigSchema = z.strictObject({
  models: modelsConfigSchema,
});

export type DeploymentConfig = z.infer<typeof deploymentConfigSchema>;
