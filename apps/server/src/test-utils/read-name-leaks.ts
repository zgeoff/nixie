import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { collectNameHits } from './collect-name-hits';
import type { NameLeak } from './types';

// Each name that a core package holds as an identifier or a string literal in a file that
// production code runs. Test files and test utilities are outside it.
export async function readNameLeaks(
  root: string,
  corePackageDirs: readonly string[],
  names: readonly string[],
  skip: readonly string[],
): Promise<NameLeak[]> {
  const leaks: NameLeak[] = [];

  for (const directory of corePackageDirs) {
    const entries = await readdir(join(root, directory, 'src'), { recursive: true });

    for (const entry of entries.toSorted()) {
      const file = `${directory}/src/${entry}`;

      if (isProductionSource(entry) && !skip.includes(file)) {
        const source = await readFile(join(root, file), 'utf8');

        for (const name of collectNameHits(source, names)) {
          leaks.push({ file, name });
        }
      }
    }
  }

  return leaks;
}

function isProductionSource(entry: string): boolean {
  return (
    /\.tsx?$/u.test(entry) &&
    !/\.test\.tsx?$/u.test(entry) &&
    !entry.split('/').includes('test-utils')
  );
}
