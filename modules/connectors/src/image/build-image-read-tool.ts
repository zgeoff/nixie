import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { buildImageOutput } from './build-image-output';
import { noteDeclaration } from './note-declaration';
import { pickRoomLeft } from './pick-room-left';
import { readImageEntry } from './read-image-entry';
import { readImagePrompts } from './read-image-prompts';
import { refuseImage } from './refuse-image';
import { showImage } from './show-image';
import type { ImageToolOptions } from './types';

const readInput = {
  type: 'object',
  properties: {
    image: { type: 'string', minLength: 1, description: 'the image ID' },
  },
  required: ['image'],
  additionalProperties: false,
};

const readArguments = z.object({ image: z.string() });

const readOutput = buildImageOutput([
  'image',
  'from',
  'prompt',
  'size',
  'isShown',
  'roomLeft',
  'refused',
]);

export function buildImageReadTool(options: ImageToolOptions): ToolDefinition {
  return {
    name: 'image.read',
    description:
      'Shows you a stored image again, by its ID, with the prompt it was drawn from. It shows the ' +
      'picture only when the session has room for it, and says so in isShown.',
    input: readInput,
    output: readOutput.output,
    declaration: { ...noteDeclaration, results: readOutput.results },
    execution: 'direct',
    run: async (call, context) => {
      const input = readArguments.parse(call.input);

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

      const prompts = await readImagePrompts(options.log, [entry.row]);
      const shown = await showImage(context.run, entry.bytes, options.imageLongEdge);

      return {
        status: 'ok',
        result: {
          image: entry.row.image_id,
          from: entry.row.parent_id,
          prompt: prompts.get(entry.row.image_id)?.prompt ?? null,
          size: entry.row.size,
          isShown: shown.image !== null,
          roomLeft: pickRoomLeft(context.run.session?.readImageRoom?.()),
        },
        images: shown.image === null ? [] : [shown.image],
      };
    },
  };
}
