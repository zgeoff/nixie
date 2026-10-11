// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { apiImplementer } from './api-implementer';
import { readThreadPage } from './read-thread-page';
import { requireCaller } from './require-caller';
import type { APIContext } from './types';
import { writeOwnerMessage } from './write-owner-message';

// Builds the conversation's procedures: a page of a thread, and your message into a task's inbox.
export function buildConversationProcedures(context: APIContext) {
  return {
    read: apiImplementer.conversation.read.handler(async (options) => {
      await requireCaller(context, options.context, options.errors.UNAUTHORIZED);

      const page = await readThreadPage(context, options.input);

      if (page === null) {
        throw options.errors.THREAD_NOT_FOUND();
      }
      return { ...page, records: [...page.records] };
    }),

    send: apiImplementer.conversation.send.handler(async (options) => {
      const caller = await requireCaller(context, options.context, options.errors.UNAUTHORIZED);
      const result = await writeOwnerMessage(context, caller, options.input);

      if (result.status === 'thread_not_found') {
        throw options.errors.THREAD_NOT_FOUND();
      }
      if (result.status === 'reused') {
        throw options.errors.CLIENT_ACTION_ID_REUSED();
      }
      if (result.status === 'unauthorized') {
        throw options.errors.UNAUTHORIZED();
      }
      return { duplicate: result.duplicate, sequence: result.sequence };
    }),
  };
}
