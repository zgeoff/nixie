import { apiImplementer } from './api-implementer';
import { createConversationProcedures } from './create-conversation-procedures';
import { createEnrolProcedure } from './create-enrol-procedure';
import { createMemoryProcedures } from './create-memory-procedures';
import { createMemoryViewRouter } from './create-memory-view-router';
import { createRecordProcedures } from './create-record-procedures';
import { createRevokeProcedure } from './create-revoke-procedure';
import { createSessionProcedures } from './create-session-procedures';
import { createTaskProcedures } from './create-task-procedures';
import type { APIContext, ReadViewMemory } from './types';

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
    tasks: createTaskProcedures(context),
  });
}
