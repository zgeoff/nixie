// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { apiImplementer } from './api-implementer';
import { readThreadPage } from './read-thread-page';
import { requireCaller } from './require-caller';
import type { APIContext } from './types';
import { writeOwnerMessage } from './write-owner-message';
import { writeRecordForget } from './write-record-forget';

// Builds the conversation's procedures: a page of a thread, your message into a task's inbox, and
// the forget of a message or a reply.
export function buildConversationProcedures(context: APIContext) {
  return {
    read: apiImplementer.conversation.read.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const page = await readThreadPage(context, options.input);

      if (page === null) {
        throw options.errors.THREAD_NOT_FOUND();
      }

      return { ...page, records: [...page.records] };
    }),

    send: apiImplementer.conversation.send.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

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

    forget: apiImplementer.conversation.forget.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const result = await writeRecordForget(context, caller, options.input);

      if (result.status !== 'forgotten') {
        throw {
          not_found: options.errors.RECORD_NOT_FOUND,
          reused: options.errors.CLIENT_ACTION_ID_REUSED,
          unauthorized: options.errors.UNAUTHORIZED,
        }[result.status]();
      }

      return { forgottenAt: new Date(result.forgottenAt) };
    }),
  };
}
