import { createApprovalProcedures } from '../approval/create-approval-procedures';
import { createMemoryProcedures } from '../memory/create-memory-procedures';
import { createMemoryViewRouter } from '../memory/create-memory-view-router';
import { createNixieProcedures } from '../pause/create-nixie-procedures';
import { createRecoveryProcedures } from '../pause/create-recovery-procedures';
import { createRuleProposalProcedures } from '../proposal/create-rule-proposal-procedures';
import { createConversationProcedures } from '../record/create-conversation-procedures';
import { createRecordProcedures } from '../record/create-record-procedures';
import { createSessionProcedures } from '../session/create-session-procedures';
import type { APIContext, ReadViewMemory } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { createBackupProcedures } from './create-backup-procedures';
import { createEnrolProcedure } from './create-enrol-procedure';
import { createRevokeProcedure } from './create-revoke-procedure';
import { createTaskProcedures } from './create-task-procedures';

export function createAPIRouter(
  context: APIContext,
  readMemory: ReadViewMemory,
  runInForceSeed: () => Promise<void>,
) {
  return apiImplementer.router({
    approvals: createApprovalProcedures(context, { readMemory, runInForceSeed }),
    backups: createBackupProcedures(context),
    conversation: createConversationProcedures(context),
    memory: {
      ...createMemoryProcedures(context),
      ...createMemoryViewRouter(context, readMemory),
    },
    nixie: createNixieProcedures(context),
    ...createRecordProcedures(context),
    recovery: createRecoveryProcedures(context),
    rules: createRuleProposalProcedures({ ...context, runInForceSeed }),
    sessions: {
      enrol: createEnrolProcedure(context),
      revoke: createRevokeProcedure(context),
      ...createSessionProcedures(context),
    },
    tasks: createTaskProcedures(context),
  });
}
