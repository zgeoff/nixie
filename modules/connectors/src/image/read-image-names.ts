import type { ErasableFields, Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { z } from 'zod';
import { imageNamedCodec } from './image-named-codec';

// The latest name of each image, by the images' IDs. A cleared name and a forgotten one read as null.
export async function readImageNames(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
): Promise<ReadonlyMap<string, string | null>> {
  const names = new Map<string, string | null>();

  const entries = await readRecords(log, {
    afterSequence: 0,
    kinds: [imageNamedCodec.kind],
    order: 'newest',
    limit: 10_000,
  });

  for (const entry of entries) {
    const record = entry.record;
    const image = imageNamedCodec.decode(record.payload).image;

    if (names.has(image)) {
      continue;
    }

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
