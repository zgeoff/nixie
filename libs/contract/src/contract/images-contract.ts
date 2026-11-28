import { z } from 'zod';
import { galleryImageSchema } from '../image/gallery-image-schema';
import { featureOffErrors } from './feature-off-errors';
import { forgetBackupSchema } from './forget-backup-schema';
import { reusedIDErrors } from './reused-id-errors';
import { signedIn } from './signed-in';

const imagesProcedure = signedIn.errors(featureOffErrors);
const checkedAction = imagesProcedure.errors(reusedIDErrors);
const imageIDSchema = z.string().min(1).max(100);
const unknownImage = { message: 'No stored image has this ID', status: 404 } as const;
const imageForgotten = { message: 'A forget made this image unreadable', status: 410 } as const;

export const imagesContract = {
  list: imagesProcedure
    .input(
      z.object({
        // true lists only pinned images; absent or false lists all
        pinnedOnly: z.boolean().optional(),

        // lists the rows older than this one
        cursor: z.string().regex(/^\d+$/u).max(20).optional(),
      }),
    )
    .output(
      z.object({
        // by images rowid, newest first, as image.list orders
        images: z.array(galleryImageSchema).max(30),

        // the rowid of the oldest row read; null on the last page
        nextCursor: z.string().nullable(),
      }),
    ),

  read: imagesProcedure
    .errors({ UNKNOWN_IMAGE: unknownImage })
    .input(z.object({ image: imageIDSchema }))
    .output(galleryImageSchema),

  readBytes: imagesProcedure
    .errors({ UNKNOWN_IMAGE: unknownImage, IMAGE_FORGOTTEN: imageForgotten })
    .input(
      z.object({
        image: imageIDSchema,

        // full returns the stored PNG, typed image/png
        size: z.enum(['thumbnail', 'full']),
      }),
    )
    .output(z.file()),

  forget: checkedAction
    .errors({ UNKNOWN_IMAGE: unknownImage })
    .input(z.object({ clientActionID: z.uuid(), image: imageIDSchema }))
    .output(z.object({ forgottenAt: z.date(), backup: forgetBackupSchema })),
};
