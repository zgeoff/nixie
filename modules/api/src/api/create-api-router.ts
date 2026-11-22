import type { DefinitionsContext } from '@heynixie/definitions';
import { createApprovalProcedures } from '../approval/create-approval-procedures';
import { createDefinitionProcedures } from '../definition/create-definition-procedures';
import { createDeviceProcedures } from '../device/create-device-procedures';
import { createSignOutProcedure } from '../device/create-sign-out-procedure';
import { createFilesProcedures } from '../file/create-files-procedures';
import { createImagesProcedures } from '../image/create-images-procedures';
import { createMemoryProcedures } from '../memory/create-memory-procedures';
import { createMemoryViewRouter } from '../memory/create-memory-view-router';
import { createNotebookProcedures } from '../notebook/create-notebook-procedures';
import { createPasskeyProcedures } from '../passkey/create-passkey-procedures';
import { createNixieProcedures } from '../pause/create-nixie-procedures';
import { createRecoveryProcedures } from '../pause/create-recovery-procedures';
import { createConversationProcedures } from '../record/create-conversation-procedures';
import { createRecordProcedures } from '../record/create-record-procedures';
import { createReminderProcedures } from '../reminder/create-reminder-procedures';
import { createMandateProcedures } from '../rule/create-mandate-procedures';
import { createRuleProcedures } from '../rule/create-rule-procedures';
import { createSessionProcedures } from '../session/create-session-procedures';
import { createSpendProcedures } from '../spend/create-spend-procedures';
import type { APIContext, ReadViewMemory } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { createBackupProcedures } from './create-backup-procedures';
import { createEnrolProcedure } from './create-enrol-procedure';
import { createRevokeProcedure } from './create-revoke-procedure';
import { createTaskProcedures } from './create-task-procedures';
import { createViewProcedures } from './create-view-procedures';

export function createAPIRouter(
  context: APIContext,
  readMemory: ReadViewMemory,
  runInForceSeed: () => Promise<void>,
  readDefinitions: () => DefinitionsContext | null,
) {
  const views = createViewProcedures(context);

  return apiImplementer.router({
    approvals: createApprovalProcedures(context, { readMemory, runInForceSeed }),
    backups: createBackupProcedures(context),
    conversation: createConversationProcedures(context),
    definitions: { ...createDefinitionProcedures(context, readDefinitions), ...views.definitions },
    devices: createDeviceProcedures(context),
    files: createFilesProcedures(context),
    images: createImagesProcedures(context),
    memory: {
      ...createMemoryProcedures(context),
      ...createMemoryViewRouter(context, readMemory),
    },
    nixie: createNixieProcedures(context),
    notebook: createNotebookProcedures(context),
    spend: createSpendProcedures(context),
    ...createRecordProcedures(context),
    passkeys: createPasskeyProcedures(context),
    recovery: createRecoveryProcedures(context),
    reminders: createReminderProcedures(context),
    rules: {
      ...createRuleProcedures({ ...context, runInForceSeed }),
      ...createMandateProcedures({ ...context, runInForceSeed }),
    },
    sessions: {
      enrol: createEnrolProcedure(context),
      revoke: createRevokeProcedure(context),
      signOut: createSignOutProcedure(context),
      ...createSessionProcedures(context),
    },
    tasks: { ...createTaskProcedures(context), ...views.tasks },
    triggers: views.triggers,
  });
}
