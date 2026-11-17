import { join } from 'node:path';
import { nixieSchema } from '@heynixie/db';
import { readPreviousReleaseTag } from '@heynixie/server/test-utils';
import { $ } from 'bun';

interface PreviousReleaseReadableOptions {
  readonly gitDir: string;
  readonly oldestReader: number;
}

const defaultOptions: PreviousReleaseReadableOptions = {
  gitDir: join(import.meta.dir, '..', '..', '..'),
  oldestReader: nixieSchema.oldestReader,
};

// The previous release writes the schema version of its own migration count, and it opens data
// that this build migrated only when that version reaches this build's oldest reader. A suite that
// starts it on such data reads this to know whether that release starts or refuses.
export async function probePreviousReleaseReadable(
  options: PreviousReleaseReadableOptions = defaultOptions,
): Promise<boolean> {
  const tag = await readPreviousReleaseTag(options.gitDir);

  const listed = await $`git ls-tree --name-only ${tag} libs/db/src/migrations/`
    .cwd(options.gitDir)
    .text();

  const writes = listed
    .split('\n')
    .filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts')).length;

  return writes >= options.oldestReader;
}
