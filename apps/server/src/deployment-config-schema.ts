import { actionsConfigSchema } from '@heynixie/actions';
import { webFetchConfigSchema } from '@heynixie/connectors';
import { definitionsConfigSchema } from '@heynixie/definitions';
import { writerConfigSchema } from '@heynixie/memory';
import { modelsConfigSchema } from '@heynixie/models';
import { impConfigSchema } from '@heynixie/sandbox-imp';
import { tasksConfigSchema } from '@heynixie/tasks';
import { z } from 'zod';
import { serverConfigSchema } from './server-config-schema';

// The deployment configuration, composed from one schema per module for the section it reads.
// Every object refuses an unknown key, so a typo never passes as a default, and a later slice adds
// its section here. No section holds a secret: secrets stay in the encrypted secrets file.
export const deploymentConfigSchema = z.strictObject({
  server: serverConfigSchema.default(serverConfigSchema.parse({})),
  models: modelsConfigSchema,
  imp: impConfigSchema,
  definitions: definitionsConfigSchema,
  web_fetch: webFetchConfigSchema.default(webFetchConfigSchema.parse({})),
  tasks: tasksConfigSchema.default(tasksConfigSchema.parse({})),
  actions: actionsConfigSchema.default(actionsConfigSchema.parse({})),
  memory_writer: writerConfigSchema.default(writerConfigSchema.parse({})),
});

export type DeploymentConfig = z.infer<typeof deploymentConfigSchema>;
