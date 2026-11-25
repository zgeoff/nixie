import { actionsConfigSchema } from '@heynixie/actions';
import { apiConfigSchema } from '@heynixie/api';
import { backupConfigSchema } from '@heynixie/backup';
import {
  computerConfigSchema,
  imagesConfigSchema,
  searchConfigSchema,
  timeConfigSchema,
  webFetchConfigSchema,
} from '@heynixie/connectors';
import { definitionsConfigSchema } from '@heynixie/definitions';
import { memoryConfigSchema } from '@heynixie/memory';
import { collectMissingPriceIssues } from '@heynixie/models';
import { notebookConfigSchema } from '@heynixie/notebook';
import { policyConfigSchema } from '@heynixie/policy';
import { approvalsConfigSchema, quietHoursSchema } from '@heynixie/proposals';
import { remindersConfigSchema } from '@heynixie/reminders';
import { skillsConfigSchema } from '@heynixie/skills';
import { tasksConfigSchema } from '@heynixie/tasks';
import { turnInputLogConfigSchema } from '@heynixie/turn-inputs';
import { z } from 'zod';
import { erasureConfigSchema } from '../config/erasure-config-schema';
import { forgetNoticesConfigSchema } from '../config/forget-notices-config-schema';
import { serverConfigSchema } from '../config/server-config-schema';
import { sandboxSections } from '../sandbox/sandbox-sections';
import { spendStopSchema } from '../spend/spend-stop-schema';
import { ownerConfigSchema } from '../utils/owner-config-schema';
import { modelSections } from './model-sections';

export const deploymentConfigSchema = z
  .strictObject({
    server: serverConfigSchema.default(serverConfigSchema.parse({})),
    owner: ownerConfigSchema.default(ownerConfigSchema.parse({})),
    api: apiConfigSchema.default(apiConfigSchema.parse({})),
    ...modelSections,
    ...sandboxSections,
    definitions: definitionsConfigSchema,
    web_fetch: webFetchConfigSchema.default(webFetchConfigSchema.parse({})),
    computer: computerConfigSchema.default(computerConfigSchema.parse({})),
    search: searchConfigSchema.default(searchConfigSchema.parse({})),
    images: imagesConfigSchema.nullable().default(null),
    time: timeConfigSchema.default(timeConfigSchema.parse({})),
    tasks: tasksConfigSchema.default(tasksConfigSchema.parse({})),
    reminders: remindersConfigSchema.default(remindersConfigSchema.parse({})),
    actions: actionsConfigSchema.default(actionsConfigSchema.parse({})),
    memory: memoryConfigSchema.default(memoryConfigSchema.parse({})),
    notebook: notebookConfigSchema.default(notebookConfigSchema.parse({})),
    forget_notices: forgetNoticesConfigSchema.default(forgetNoticesConfigSchema.parse({})),
    erasure: erasureConfigSchema.default(erasureConfigSchema.parse({})),
    policy: policyConfigSchema.default(policyConfigSchema.parse({})),
    approvals: approvalsConfigSchema.default(approvalsConfigSchema.parse({})),
    quiet_hours: quietHoursSchema.optional(),
    skills: skillsConfigSchema.default(skillsConfigSchema.parse({})),
    backup: backupConfigSchema.default(backupConfigSchema.parse({})),
    turn_input_log: turnInputLogConfigSchema.optional(),
    spendStop: spendStopSchema.optional(),
  })
  .superRefine((config, issues) => {
    if (config.sandbox.adapter === 'imp' && config.imp === undefined) {
      issues.addIssue({
        code: 'custom',
        path: ['imp'],
        message: 'the imp section is unset, and the imp sandbox adapter needs it',
      });
    }

    // A task counts its model calls against its dollar limit by the profile's prices, with a
    // gateway or without. A models section that failed its own checks is not yet in its final
    // shape, so the price check waits for it.
    if (issues.issues.length === 0) {
      for (const issue of collectMissingPriceIssues(config.models)) {
        issues.addIssue({ code: 'custom', path: [...issue.path], message: issue.message });
      }
    }

    // the server reaches the gateway's logins through the spendStop section
    if (config.spendStop === undefined) {
      for (const [id, profile] of Object.entries(config.models.profiles)) {
        if (profile.harness === 'codex' && profile.chatgptLogin) {
          issues.addIssue({
            code: 'custom',
            path: ['models', 'profiles', id, 'chatgpt_login'],
            message: `the profile ${id} sets chatgpt_login, and the spendStop section is unset, which the server needs to reach the model gateway's logins`,
          });
        }
      }
    }
  });

export type DeploymentConfig = z.infer<typeof deploymentConfigSchema>;
