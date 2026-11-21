import { createShortID } from '@heynixie/db';
import { readOwnerImage } from '@heynixie/tasks';
import type { DirectResult, ToolDefinition, ToolOutcome, ToolRun } from '@heynixie/tools';
import { ToolResultRefusedError } from '@heynixie/tools';
import { z } from 'zod';
import { readCodeFileBytes } from '../code/read-code-file';
import { readCodeFileEntry } from '../code/read-code-file-entry';
import { getPageSession } from '../utils/get-page-session';
import { probeSessionEnded } from '../web/probe-session-ended';
import { buildImageOutput } from './build-image-output';
import { convertToPng } from './convert-to-png';
import { imageLimits } from './image-limits';
import { formatImageSize } from './image-size';
import type { ImageTables } from './image-tables';
import { noteDeclaration } from './note-declaration';
import { pickRoomLeft } from './pick-room-left';
import { refuseImage } from './refuse-image';
import { showImage } from './show-image';
import type { ImageToolOptions } from './types';

const importInput = {
  type: 'object',
  properties: {
    file: {
      type: 'string',
      minLength: 1,
      description: 'a file ID from the files list of a code.run result on this thread',
    },
    photo: {
      type: 'object',
      properties: {
        eventID: {
          type: 'string',
          pattern: '^#?[1-9][0-9]{0,14}$',
          description: 'the eventID of the message that holds the photo',
        },
        number: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'the n of the photo in that message',
        },
      },
      required: ['eventID', 'number'],
      additionalProperties: false,
      description: 'a photo the owner attached to a message of this thread',
    },
  },
  additionalProperties: false,
  oneOf: [{ required: ['file'] }, { required: ['photo'] }],
};

const importArguments = z.object({
  file: z.string().optional(),
  photo: z.object({ eventID: z.string(), number: z.int() }).optional(),
});

const importOutput = buildImageOutput(['image', 'from', 'size', 'isShown', 'roomLeft', 'refused']);

export function buildImageImportTool(options: ImageToolOptions): ToolDefinition {
  return {
    name: 'image.import',
    description:
      'Keeps a picture as an image you can look at, edit and use as a reference. Pass a file ID ' +
      'from a code.run result on this thread, or a photo the owner sent. nixie converts the ' +
      'picture to PNG, scales it down until its long side is at most 2048 pixels, and shows it ' +
      'when the session has room. Drawing from a photo of the owner sends it to the image ' +
      'provider, which the owner approves.',
    input: importInput,
    output: importOutput.output,
    declaration: { ...noteDeclaration, results: importOutput.results },
    execution: 'direct',
    run: async (call, context) => {
      const input = importArguments.parse(call.input);

      const read = await readImportedBytes(options, input, context.run);

      return 'refusal' in read
        ? { status: 'ok', ...read.refusal }
        : writeImport(options, read, context.run);
    },
  };
}

interface ImportedBytes {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly source: 'file' | 'photo';

  // the record that held the original, which a forget of it erases the import with
  readonly sourceSequence: number;
}

async function readImportedBytes(
  options: ImageToolOptions,
  input: z.infer<typeof importArguments>,
  run: ToolRun,
): Promise<ImportedBytes | { readonly refusal: DirectResult }> {
  if (input.photo !== undefined) {
    const sequence = Number(input.photo.eventID.replace(/^#/u, ''));

    const photo = await readOwnerImage(options.log, {
      thread: run.logThread,
      sequence,
      position: input.photo.number - 1,
    });

    return photo === null
      ? {
          refusal: refuseImage(
            'UNKNOWN_PHOTO',
            `No photo ${String(input.photo.number)} is on the message ${input.photo.eventID} of this thread, or the owner forgot it.`,
          ),
        }
      : { bytes: photo.bytes, source: 'photo', sourceSequence: sequence };
  }

  const fileID = input.file ?? '';

  const entry = await readCodeFileEntry(options.log, fileID);

  if (entry.kind === 'missing' || (entry.kind === 'ok' && entry.row.thread !== run.thread)) {
    return { refusal: refuseImage('UNKNOWN_FILE', `No file ${fileID} belongs to this thread.`) };
  }

  if (entry.kind === 'forgotten') {
    return { refusal: refuseImage('FILE_FORGOTTEN', `The file ${fileID} was forgotten.`) };
  }

  const bytes = await readCodeFileBytes(options.log, entry.row);

  return bytes === undefined
    ? { refusal: refuseImage('FILE_FORGOTTEN', `The file ${fileID} was forgotten.`) }
    : { bytes, source: 'file', sourceSequence: entry.row.sequence };
}

async function writeImport(
  options: ImageToolOptions,
  read: ImportedBytes,
  run: ToolRun,
): Promise<ToolOutcome> {
  const png = await convertToPng(read.bytes, { longEdge: imageLimits.importLongEdge });

  if (png.kind === 'unreadable') {
    return {
      status: 'ok',
      ...refuseImage('NOT_IMAGE', `The bytes do not decode as a picture: ${png.reason}`),
    };
  }

  const image = createShortID();
  const uuid = crypto.randomUUID();

  const shown = await showImage(run, png.bytes, options.imageLongEdge);

  const size = formatImageSize(png);

  const result = {
    image,
    from: null,
    size,
    isShown: shown.image !== null,
    roomLeft: pickRoomLeft(run.session?.readImageRoom?.()),
  };

  return {
    status: 'ok',
    result,
    record: { ...result, source: read.source },
    images: shown.image === null ? [] : [shown.image],
    attachments: [png.bytes],
    hidden: { uuids: { [image]: uuid } },
    writeBeside: async (tx, resultSequence) => {
      const hasEnded = await probeSessionEnded(tx, getPageSession(run));

      if (hasEnded) {
        throw new ToolResultRefusedError(
          'the session ended while the picture was imported, so the call keeps no image',
        );
      }

      await tx
        .$extendTables<ImageTables>()
        .insertInto('images')
        .values({
          image_id: image,
          uuid,
          sequence: resultSequence,
          position: 0,
          parent_id: null,
          source: read.source,
          source_seq: read.sourceSequence,
          is_pinned: 0,
          profile: null,
          model: null,
          media_type: 'image/png',
          size,
          byte_count: png.bytes.byteLength,
          created_at: options.clock.now(),
        })
        .execute();
    },
  };
}
