// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { apiImplementer } from './api-implementer';
import { readOwnerImage } from './read-owner-image';
import { readOwnerImages } from './read-owner-images';
import { readThreadPage } from './read-thread-page';
import { requireCaller } from './require-caller';
import type { APIContext } from './types';
import { writeOwnerMessage } from './write-owner-message';
import { writeRecordForget } from './write-record-forget';

// Builds the conversation's procedures: a page of a thread, your message into a task's inbox, one
// image of your message, and the forget of a message or a reply.
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

    send: buildSendProcedure(context),

    readImage: buildReadImageProcedure(context),

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

// your message checks its images before it writes anything, so a refused image leaves no record
function buildSendProcedure(context: APIContext) {
  return apiImplementer.conversation.send.handler(async (options) => {
    const caller = await requireCaller(
      context,
      options.context.sessionToken,
      options.errors.UNAUTHORIZED,
    );

    const images = await readOwnerImages(options.input.images ?? []);

    if (images.status === 'refused') {
      throw options.errors.IMAGE_REFUSED({
        data: { position: images.position, reason: images.reason },
      });
    }

    const result = await writeOwnerMessage(context, caller, {
      ...options.input,
      images: images.images,
    });

    if (result.status !== 'written') {
      throw {
        thread_not_found: options.errors.THREAD_NOT_FOUND,
        reused: options.errors.CLIENT_ACTION_ID_REUSED,
        unauthorized: options.errors.UNAUTHORIZED,
      }[result.status]();
    }

    return { duplicate: result.duplicate, sequence: result.sequence };
  });
}

function buildReadImageProcedure(context: APIContext) {
  return apiImplementer.conversation.readImage.handler(async (options) => {
    await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

    const image = await readOwnerImage(context, options.input);

    if (image === null) {
      throw options.errors.IMAGE_NOT_FOUND();
    }

    return image;
  });
}
