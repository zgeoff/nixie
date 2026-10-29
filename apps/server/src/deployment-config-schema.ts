import { actionsConfigSchema } from '@heynixie/actions';
import { backupConfigSchema } from '@heynixie/backup';
import { timeConfigSchema, webFetchConfigSchema } from '@heynixie/connectors';
import { definitionsConfigSchema } from '@heynixie/definitions';
import {
  consolidationConfigSchema,
  memoryConfigSchema,
  writerConfigSchema,
} from '@heynixie/memory';
import { skillsConfigSchema } from '@heynixie/skills';
import { tasksConfigSchema } from '@heynixie/tasks';
import { z } from 'zod';
import { modelSections } from './model-sections';
import { ownerConfigSchema } from './owner-config-schema';
import { sandboxSections } from './sandbox-sections';
import { serverConfigSchema } from './server-config-schema';

export const deploymentConfigSchema = z
  .strictObject({
    server: serverConfigSchema.default(serverConfigSchema.parse({})),
    owner: ownerConfigSchema.default(ownerConfigSchema.parse({})),
    ...modelSections,
    ...sandboxSections,
    definitions: definitionsConfigSchema,
    web_fetch: webFetchConfigSchema.default(webFetchConfigSchema.parse({})),
    time: timeConfigSchema.default(timeConfigSchema.parse({})),
    tasks: tasksConfigSchema.default(tasksConfigSchema.parse({})),
    actions: actionsConfigSchema.default(actionsConfigSchema.parse({})),
    memory_writer: writerConfigSchema.default(writerConfigSchema.parse({})),
    memory: memoryConfigSchema.default(memoryConfigSchema.parse({})),
    memory_consolidation: consolidationConfigSchema.default(consolidationConfigSchema.parse({})),
    skills: skillsConfigSchema.default(skillsConfigSchema.parse({})),
    backup: backupConfigSchema.default(backupConfigSchema.parse({})),
  })
  .superRefine((config, issues) => {
    if (config.sandbox.adapter === 'imp' && config.imp === undefined) {
      issues.addIssue({
        code: 'custom',
        path: ['imp'],
        message: 'the imp section is unset, and the imp sandbox adapter needs it',
      });
    }
  });

export type DeploymentConfig = z.infer<typeof deploymentConfigSchema>;
