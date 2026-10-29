import type { Log } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { readOwnerImage } from './read-owner-image';

const logReadImageInput = {
  type: 'object',
  properties: {
    eventID: {
      type: 'string',
      pattern: '^#?[1-9][0-9]{0,14}$',
      description: 'the eventID of the message that holds the image',
    },
    number: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      description: 'the n of the image in that message, from its <dropped-image> marker',
    },
  },
  required: ['eventID', 'number'],
  additionalProperties: false,
};

const logReadImageOutput = {
  type: 'object',
  properties: {
    eventID: { type: 'string' },
    number: { type: 'integer' },
    mediaType: { type: 'string' },
  },
  required: ['eventID', 'number', 'mediaType'],
  additionalProperties: false,
};

const logReadImageArguments = z.object({ eventID: z.string(), number: z.int() });

export function buildLogReadImageTool(log: Pick<Log, 'deploymentKey' | 'writer'>): ToolDefinition {
  return {
    name: 'log.read_image',
    description:
      'Shows you one image the owner attached to a message in this conversation, by the eventID ' +
      'of the message and the number of the image: the n of its <dropped-image> marker, or the ' +
      'image a memory.recall item names. Open an image only when seeing it would change your ' +
      'answer. It returns image unavailable once the owner forgot the message, when the ' +
      "message holds no such image of the owner's, or when this session already holds as many " +
      'images as it can take.',
    input: logReadImageInput,
    output: logReadImageOutput,
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],
      results: { eventID: 'owner_data', number: 'owner_data', mediaType: 'owner_data' },
    },
    execution: 'direct',

    run: async (call, context) => {
      const input = logReadImageArguments.parse(call.input);
      const eventID = input.eventID.replace(/^#/u, '');

      const image = await readOwnerImage(log, {
        thread: context.run.thread,
        sequence: Number(eventID),
        position: input.number - 1,
      });

      if (image === null) {
        return { status: 'error', message: 'image unavailable' };
      }

      if (context.run.session?.reserveImages?.([image]) !== true) {
        return {
          status: 'error',
          message: 'image unavailable: this session holds as many images as it can take',
        };
      }

      return {
        status: 'ok',
        result: { eventID, number: input.number, mediaType: image.mediaType },
        images: [image],
      };
    },
  };
}
