import { cp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { readTestBundle } from './read-test-bundle';

const outDir = join(import.meta.dir, '..', '..', 'dist', 'test-bundle');

// The build of the `nixie` program in rig.config.ts. The test bundle is the one the unit tests read,
// so this copies it to the path that the program declares, in place of building a second one.
export async function writeTestProgram(): Promise<void> {
  const bundle = await readTestBundle(true);

  await rm(outDir, { recursive: true, force: true });
  await cp(dirname(bundle.entry), outDir, { recursive: true });
}

if (import.meta.main) {
  await writeTestProgram();
}
