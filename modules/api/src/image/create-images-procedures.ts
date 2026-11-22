// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { readGalleryImage, readGalleryPage, readImageEntry } from '@heynixie/connectors';
import { ORPCError } from '@orpc/server';
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { createThumbnail } from './create-thumbnail';
import { readImageForgetBackup } from './read-image-forget-backup';
import { toContractGalleryImage } from './to-contract-gallery-image';
import { writeImageForget } from './write-image-forget';

export function createImagesProcedures(context: APIContext) {
  return {
    list: apiImplementer.images.list.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const page = await readGalleryPage(context.log, {
        isPinnedOnly: options.input.pinnedOnly === true,
        cursor: options.input.cursor === undefined ? null : Number(options.input.cursor),
      });

      return { images: page.images.map(toContractGalleryImage), nextCursor: page.nextCursor };
    }),

    read: apiImplementer.images.read.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const image = await readGalleryImage(context.log, options.input.image);

      if (image === null) {
        throw options.errors.UNKNOWN_IMAGE();
      }

      return toContractGalleryImage(image);
    }),

    readBytes: apiImplementer.images.readBytes.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const entry = await readImageEntry(context.log, options.input.image);

      if (entry.kind === 'missing') {
        throw options.errors.UNKNOWN_IMAGE();
      }

      if (entry.kind === 'forgotten') {
        throw options.errors.IMAGE_FORGOTTEN();
      }

      if (options.input.size === 'full') {
        return new File([entry.bytes], `${entry.row.image_id}.png`, { type: 'image/png' });
      }

      const thumbnail = await createThumbnail(entry.bytes);

      return new File([thumbnail], `${entry.row.image_id}.webp`, { type: 'image/webp' });
    }),

    forget: apiImplementer.images.forget.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      const result = await writeImageForget(context, caller, {
        clientActionID: options.input.clientActionID,
        image: options.input.image,
      });

      if (result.status === 'action_not_finished') {
        throw new ORPCError('CONFLICT', {
          message: 'The queued action has not run yet. Cancel it, or wait for it to run.',
        });
      }

      if (result.status !== 'forgotten') {
        throw {
          not_found: options.errors.UNKNOWN_IMAGE,
          reused: options.errors.CLIENT_ACTION_ID_REUSED,
          unauthorized: options.errors.UNAUTHORIZED,
        }[result.status]();
      }

      return {
        forgottenAt: new Date(result.forgottenAt),
        backup: await readImageForgetBackup(context, result.targets),
      };
    }),
  };
}
