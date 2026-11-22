import type { ErasableFields, Log, LogTables } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { sql } from 'kysely';
import { z } from 'zod';
import { imageNamedCodec } from './image-named-codec';

// The latest name of each of the images, by the images' IDs. A cleared name and a forgotten one
// read as null, and an image with no name record is absent.
export async function readImageNames(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  imageIDs: readonly string[],
): Promise<ReadonlyMap<string, string | null>> {
  const names = new Map<string, string | null>();

  if (imageIDs.length === 0) {
    return names;
  }

  const imageOf = sql`json_extract(payload, '$.image')`;

  const latest = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select((builder) => builder.fn.max('sequence').as('sequence'))
    .where('kind', '=', imageNamedCodec.kind)
    .where(imageOf, 'in', imageIDs)
    .groupBy(imageOf)
    .execute();

  const sequences = latest.flatMap((row) => (row.sequence === null ? [] : [row.sequence]));

  if (sequences.length === 0) {
    return names;
  }

  const entries = await readRecords(log, {
    afterSequence: 0,
    sequences,
    limit: sequences.length,
  });

  for (const entry of entries) {
    const record = entry.record;
    const image = imageNamedCodec.decode(record.payload).image;

    names.set(image, readName(record.erasable));
  }

  return names;
}

const nameSchema = z.object({ name: z.string().nullable() });

function readName(erasable: ErasableFields): string | null {
  if (erasable.status !== 'readable') {
    return null;
  }

  const parsed = nameSchema.safeParse(erasable.fields);

  return parsed.success ? parsed.data.name : null;
}
