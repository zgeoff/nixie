import { nixieSchema } from '@heynixie/db';
import { $ } from 'bun';

const migrationFilePattern = /^(?<number>\d{4})-.*-migration\.ts$/u;

interface PreviousReleaseReadsOptions {
  readonly gitDir: string;
  readonly oldestReader?: number;
}

// A release can run on this build's data only while it writes a schema at or above the build's
// oldest reader. It writes the number of its newest migration.
export async function probePreviousReleaseReads(
  tag: string,
  options: PreviousReleaseReadsOptions,
): Promise<boolean> {
  const output = await $`git ls-tree --name-only ${tag} libs/db/src/migrations/`
    .cwd(options.gitDir)
    .text();

  const numbers = output
    .split('\n')
    .map((path) => migrationFilePattern.exec(path.split('/').pop() ?? '')?.groups?.['number'])
    .filter((number) => number !== undefined)
    .map(Number);

  return Math.max(0, ...numbers) >= (options.oldestReader ?? nixieSchema.oldestReader);
}
