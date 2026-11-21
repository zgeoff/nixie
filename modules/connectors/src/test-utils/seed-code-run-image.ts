import type { Log } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { encodeTestImage } from './encode-test-image';
import { seedCodeRunFiles } from './seed-code-run-files';

export interface CodeRunImageSeed {
  readonly thread: string;
  readonly width: number;
  readonly height: number;
  readonly format: 'png' | 'jpeg';
}

// Runs the code tool on a stand-in sandbox that writes one picture, and returns its file ID and
// the sequence of the result record that holds it.
export async function seedCodeRunImage(log: Log, seed: CodeRunImageSeed) {
  const encoded = await encodeTestImage(seed, seed.format);

  const bytes = new Uint8Array(encoded);

  const seeded = await seedCodeRunFiles(log, {
    thread: seed.thread,
    writes: { [`out/picture.${seed.format}`]: bytes },
  });

  const file = seeded.files[0]?.file;

  invariant(file !== undefined, 'the code run wrote the picture');

  return { file, resultSequence: seeded.resultSequence };
}
