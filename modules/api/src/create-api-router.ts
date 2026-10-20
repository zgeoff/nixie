import { apiImplementer } from './api-implementer';
import { createConversationProcedures } from './create-conversation-procedures';
import { createEnrolProcedure } from './create-enrol-procedure';
import { createMemoryProcedures } from './create-memory-procedures';
import { createMemoryViewRouter } from './create-memory-view-router';
import { createRecordProcedures } from './create-record-procedures';
import { createRevokeProcedure } from './create-revoke-procedure';
import { createSessionProcedures } from './create-session-procedures';
import type { APIContext, ReadViewMemory } from './types';

// Builds the router that implements the contract. Every procedure except enrolment resolves the
// caller's session first, and a session that resolves to nobody gets UNAUTHORIZED. The memory
// view's procedures reach the memory store once the start sequence fills it.
export function createAPIRouter(context: APIContext, readMemory: ReadViewMemory) {
  return apiImplementer.router({
    conversation: createConversationProcedures(context),
    memory: {
      ...createMemoryProcedures(context),
      ...createMemoryViewRouter(context, readMemory),
    },
    ...createRecordProcedures(context),
    sessions: {
      enrol: createEnrolProcedure(context),
      revoke: createRevokeProcedure(context),
      ...createSessionProcedures(context),
    },
  });
}
