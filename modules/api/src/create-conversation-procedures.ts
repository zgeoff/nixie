// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { readOwnerImage } from '@heynixie/memory';
import { match } from 'ts-pattern';
import { apiImplementer } from './api-implementer';
import { readOwnerImages } from './read-owner-images';
import { readThreadPage } from './read-thread-page';
import { requireCaller } from './require-caller';
import type { APIContext } from './types';
import { writeMessageMove } from './write-message-move';
import { writeOwnerMessage } from './write-owner-message';
import { writeRecordForget } from './write-record-forget';

export function createConversationProcedures(context: APIContext) {
  return {
    read: apiImplementer.conversation.read.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const page = await readThreadPage(context, options.input);

      if (page === null) {
        throw options.errors.THREAD_NOT_FOUND();
      }

      return { ...page, records: [...page.records] };
    }),

    send: createSendProcedure(context),

    readImage: createReadImageProcedure(context),

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

    move: createMoveProcedure(context),
  };
}

function createSendProcedure(context: APIContext) {
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

function createReadImageProcedure(context: APIContext) {
  return apiImplementer.conversation.readImage.handler(async (options) => {
    await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

    const image = await readOwnerImage(context.log, options.input);

    if (image === null) {
      throw options.errors.IMAGE_NOT_FOUND();
    }

    return new File([image.bytes], `image-${options.input.position + 1}`, {
      type: image.mediaType,
    });
  });
}

function createMoveProcedure(context: APIContext) {
  return apiImplementer.conversation.move.handler(async (options) => {
    const caller = await requireCaller(
      context,
      options.context.sessionToken,
      options.errors.UNAUTHORIZED,
    );

    const result = await writeMessageMove(context, caller, options.input);

    return match(result)
      .with({ status: 'moved' }, (moved) => ({
        movedAt: new Date(moved.movedAt),
        taskID: moved.taskID,
      }))
      .with({ status: 'refused' }, (refused) => {
        throw match(refused.refusal.reason)
          .with('not_found', () => options.errors.RECORD_NOT_FOUND())
          .with('unknown_task', () => options.errors.TASK_NOT_FOUND())
          .with('takes_no_messages', () => options.errors.TASK_TAKES_NO_MESSAGES())
          .with('same_task', () => options.errors.ALREADY_THERE())
          .with('empty_name', 'empty_brief', (reason) => {
            throw new Error(`the contract's input schema lets no ${reason} through`);
          })
          .exhaustive();
      })
      .with({ status: 'reused' }, () => {
        throw options.errors.CLIENT_ACTION_ID_REUSED();
      })
      .with({ status: 'unauthorized' }, () => {
        throw options.errors.UNAUTHORIZED();
      })
      .exhaustive();
  });
}
