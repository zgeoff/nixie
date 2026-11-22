import type { ToolDefinition } from '@heynixie/tools';
import { sql } from 'kysely';
import { z } from 'zod';
import { buildImageOutput } from './build-image-output';
import type { ImageTables } from './image-tables';
import { noteDeclaration } from './note-declaration';
import { readImageEntry } from './read-image-entry';
import { readImageNames } from './read-image-names';
import { readImagePrompts } from './read-image-prompts';
import { refuseImage } from './refuse-image';
import type { ImageToolOptions } from './types';

const defaultLimit = 20;

const listInput = {
  type: 'object',
  properties: {
    isPinned: { type: 'boolean', description: 'true lists only pinned images' },
    from: { type: 'string', minLength: 1, description: 'lists only the edits of this image' },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 50,
      description: `the most images to list; ${String(defaultLimit)} when left out`,
    },
    after: {
      type: 'string',
      minLength: 1,
      description: 'the next value of an earlier list, to read the images older than it',
    },
  },
  additionalProperties: false,
};

const listArguments = z.object({
  isPinned: z.boolean().optional(),
  from: z.string().optional(),
  limit: z.int().default(defaultLimit),
  after: z.string().optional(),
});

const listOutput = buildImageOutput(['images', 'next', 'refused']);

export function buildImageListTool(options: ImageToolOptions): ToolDefinition {
  return {
    name: 'image.list',
    description:
      'Lists the stored images, newest first, each with its name, prompt, the image it was ' +
      'edited from and whether it is pinned. Filter by isPinned, or by `from` for the edits of ' +
      'one image. An image whose record was forgotten lists with a null prompt. When next is not ' +
      'null, pass it as `after` for the older images.',
    input: listInput,
    output: listOutput.output,
    declaration: { ...noteDeclaration, results: listOutput.results },
    execution: 'direct',
    run: async (call) => {
      const input = listArguments.parse(call.input);

      const parent =
        input.from === undefined ? null : await readImageEntry(options.log, input.from);

      if (parent?.kind === 'missing') {
        return {
          status: 'ok',
          ...refuseImage('UNKNOWN_IMAGE', `The image ${input.from ?? ''} is no image.`),
        };
      }

      if (parent?.kind === 'forgotten') {
        return {
          status: 'ok',
          ...refuseImage('IMAGE_FORGOTTEN', `The image ${input.from ?? ''} was forgotten.`),
        };
      }

      const after = input.after ?? '';
      const pinned = input.isPinned === true ? 1 : 0;
      const parentID = parent?.kind === 'ok' ? parent.row.image_id : '';

      const rows = await options.log.writer.db
        .$extendTables<ImageTables>()
        .selectFrom('images')
        .selectAll()
        .$if(input.isPinned !== undefined, (query) => query.where('is_pinned', '=', pinned))
        .$if(parent !== null, (query) => query.where('parent_id', '=', parentID))
        .$if(input.after !== undefined, (query) =>
          query.where(sql`rowid`, '<', sql`(select rowid from images where image_id = ${after})`),
        )
        .orderBy(sql`rowid`, 'desc')
        .limit(input.limit + 1)
        .execute();

      const page = rows.slice(0, input.limit);

      const [prompts, names] = await Promise.all([
        readImagePrompts(options.log, page),
        readImageNames(
          options.log,
          page.map((row) => row.image_id),
        ),
      ]);

      const hasMore = rows.length > input.limit;

      return {
        status: 'ok',
        result: {
          images: page.map((row) => ({
            image: row.image_id,
            name: names.get(row.image_id) ?? null,
            isPinned: row.is_pinned === 1,
            from: row.parent_id,
            prompt: prompts.get(row.image_id)?.prompt ?? null,
            isForgotten: prompts.get(row.image_id)?.isForgotten ?? false,
            at: new Date(row.created_at).toISOString(),
          })),
          next: hasMore ? (page.at(-1)?.image_id ?? null) : null,
        },
      };
    },
  };
}
