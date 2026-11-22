import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { buildImageOutput } from './build-image-output';
import { noteDeclaration } from './note-declaration';
import { refuseImage } from './refuse-image';
import type { ImageToolOptions } from './types';
import { writeImageName } from './write-image-name';

const nameInput = {
  type: 'object',
  properties: {
    image: { type: 'string', minLength: 1, description: 'the image ID' },
    name: {
      type: ['string', 'null'],
      minLength: 1,
      maxLength: 200,
      description: 'the name to give the image; null clears it',
    },
  },
  required: ['image', 'name'],
  additionalProperties: false,
};

const nameArguments = z.object({ image: z.string(), name: z.string().nullable() });
const nameOutput = buildImageOutput(['image', 'name', 'refused']);

export function buildImageNameTool(options: ImageToolOptions): ToolDefinition {
  return {
    name: 'image.name',
    description:
      'Gives an image a name, such as "cove, final", so image.list shows it. A name of null ' +
      'clears it.',
    input: nameInput,
    output: nameOutput.output,
    declaration: { ...noteDeclaration, content: ['name'], results: nameOutput.results },
    execution: 'direct',
    run: async (call, context) => {
      const input = nameArguments.parse(call.input);

      const entry = await writeImageName(options, {
        thread: context.run.thread,
        image: input.image,
        name: input.name,
      });

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

      return { status: 'ok', result: { image: entry.row.image_id, name: input.name } };
    },
  };
}
