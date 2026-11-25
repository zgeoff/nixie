import { actionsProjection } from '@heynixie/actions';
import { apiProjections, proposalsProjection } from '@heynixie/api';
import { budgetProjections } from '@heynixie/budgets';
import { codingProjections } from '@heynixie/coding';
import {
  gapAnswersProjection,
  gapGroupsProjection,
  ruleFiresProjection,
  runtimeTaskDefinitionsProjection,
  taskDefinitionExportsProjection,
} from '@heynixie/definitions';
import type { Log, Writer } from '@heynixie/log';
import { logProjections } from '@heynixie/log';
import { mailMessagesProjection } from '@heynixie/mail';
import { memoryProjections } from '@heynixie/memory';
import { notebookProjections } from '@heynixie/notebook';
import { knownContactsProjection } from '@heynixie/policy';
import { remindersProjections } from '@heynixie/reminders';
import { sandboxesProjection } from '@heynixie/sandbox';
import { spendProjections } from '@heynixie/spend';
import { tasksProjections } from '@heynixie/tasks';
import { triggersProjections } from '@heynixie/triggers';

export function buildServerLog(writer: Writer, deploymentKey: CryptoKey): Log {
  return {
    writer,
    deploymentKey,
    projections: [
      ...logProjections,
      ...tasksProjections,
      ...triggersProjections,
      ...codingProjections,
      mailMessagesProjection,
      ...remindersProjections,
      actionsProjection,
      sandboxesProjection,
      ...apiProjections,
      ...memoryProjections,
      ...notebookProjections,
      ruleFiresProjection,
      gapAnswersProjection,
      gapGroupsProjection,
      runtimeTaskDefinitionsProjection,
      taskDefinitionExportsProjection,
      knownContactsProjection,
      proposalsProjection,
      ...spendProjections,
      ...budgetProjections,
    ],
  };
}
