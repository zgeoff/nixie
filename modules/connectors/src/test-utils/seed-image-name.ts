import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { writeImageName } from '../image/write-image-name';

export interface ImageNameSeed {
  readonly image: string;

  // null clears the name
  readonly name: string | null;
}

// Writes the image.named record that the name tool leaves, through the tool's own write.
export async function seedImageName(log: Log, seed: ImageNameSeed): Promise<{ sequence: number }> {
  const entry = await writeImageName(
    { log, definitions: () => ({ snapshotHash: 'sha256:test' }) },
    { thread: 'conversation', image: seed.image, name: seed.name },
  );

  invariant(entry.kind === 'ok', `the image ${seed.image} is stored and not forgotten`);

  const [named] = await readRecords(log, {
    afterSequence: 0,
    kinds: ['image.named'],
    order: 'newest',
    limit: 1,
  });

  invariant(named, 'the log holds the name record');

  return { sequence: named.record.sequence };
}
