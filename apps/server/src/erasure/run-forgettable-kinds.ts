import { join } from 'node:path';
import { buildForgettableKindsSource } from './build-forgettable-kinds-source';
import { checkForgettableKinds } from './check-forgettable-kinds';
import { erasableDescriptors } from './erasable-descriptors';

const path = join(
  import.meta.dir,
  '..',
  '..',
  '..',
  '..',
  'libs',
  'contract',
  'src',
  'contract',
  'forgettable-kinds.ts',
);

if (process.argv.includes('--check')) {
  const committed = await Bun.file(path).text();

  const problem = checkForgettableKinds(committed, erasableDescriptors);

  if (problem !== null) {
    process.stderr.write(`${problem}\n`);

    process.exitCode = 1;
  }
} else {
  await Bun.write(path, buildForgettableKindsSource(erasableDescriptors));

  process.stdout.write(`wrote ${path}\n`);
}
