import { apiImplementer } from './api-implementer';
import { buildConversationProcedures } from './build-conversation-procedures';
import { buildEnrolProcedure } from './build-enrol-procedure';
import { buildMemoryChangeProcedures } from './build-memory-change-procedures';
import { buildMemoryProcedures } from './build-memory-procedures';
import { buildMemoryViewProcedures } from './build-memory-view-procedures';
import { buildRecordProcedures } from './build-record-procedures';
import { buildRevokeProcedure } from './build-revoke-procedure';
import { buildSessionProcedures } from './build-session-procedures';
import type { APIContext, ReadViewMemory } from './types';

// Builds the router that implements the contract. Every procedure except enrolment resolves the
// caller's session first, and a session that resolves to nobody gets UNAUTHORIZED. The memory
// view's procedures reach the memory store once the start sequence fills it.
export function buildAPIRouter(context: APIContext, readMemory: ReadViewMemory) {
  return apiImplementer.router({
    conversation: buildConversationProcedures(context),
    memory: {
      ...buildMemoryProcedures(context),
      ...buildMemoryViewProcedures(context, readMemory),
      ...buildMemoryChangeProcedures(context, readMemory),
    },
    ...buildRecordProcedures(context),
    sessions: {
      enrol: buildEnrolProcedure(context),
      revoke: buildRevokeProcedure(context),
      ...buildSessionProcedures(context),
    },
  });
}
