import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { buildImageOutput } from './build-image-output';
import { imagePinnedCodec } from './image-pinned-codec';
import type { ImageTables } from './image-tables';
import { imageUnpinnedCodec } from './image-unpinned-codec';
import { noteDeclaration } from './note-declaration';
import { readImageEntry } from './read-image-entry';
import { refuseImage } from './refuse-image';
import type { ImageToolOptions } from './types';

const pinInput = {
  type: 'object',
  properties: { image: { type: 'string', minLength: 1, description: 'the image ID' } },
  required: ['image'],
  additionalProperties: false,
};

const pinArguments = z.object({ image: z.string() });
const pinOutput = buildImageOutput(['image', 'isPinned', 'refused']);

export function buildImagePinTool(options: ImageToolOptions, isPinned: boolean): ToolDefinition {
  return {
    name: isPinned ? 'image.pin' : 'image.unpin',
    description: isPinned
      ? 'Pins an image, so image.list with isPinned finds it. A pin only filters the list: it keeps nothing past a forget.'
      : 'Unpins an image, so image.list with isPinned no longer finds it.',
    input: pinInput,
    output: pinOutput.output,
    declaration: { ...noteDeclaration, results: pinOutput.results },
    execution: 'direct',
    run: async (call, context) => {
      const input = pinArguments.parse(call.input);

      const entry = await readImageEntry(options.log, input.image);

      if (entry.kind === 'missing') {
        return {
          status: 'ok',
          ...refuseImage('UNKNOWN_IMAGE', `The image ${input.image} is no image.`),
        };
      }

      if (entry.kind === 'forgotten') {
        return {
          status: 'ok',
          ...refuseImage('IMAGE_FORGOTTEN', `The image ${input.image} was forgotten.`),
        };
      }

      const codec = isPinned ? imagePinnedCodec : imageUnpinnedCodec;

      await withWriteTransaction(options.log.writer, async (tx) => {
        await writeRecordsInTransaction(tx, options.log, [
          {
            kind: codec.kind,
            definitions: options.definitions(),
            thread: context.run.thread,
            payload: codec.encode({ image: entry.row.image_id }),
          },
        ]);

        await tx
          .$extendTables<ImageTables>()
          .updateTable('images')
          .set({ is_pinned: isPinned ? 1 : 0 })
          .where('image_id', '=', entry.row.image_id)
          .execute();
      });

      return { status: 'ok', result: { image: entry.row.image_id, isPinned } };
    },
  };
}
