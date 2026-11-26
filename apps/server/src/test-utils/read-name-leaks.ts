import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { collectNameHits } from './collect-name-hits';
import { readSyntaxTrees } from './read-syntax-trees';
import type { NameLeak } from './types';

// Each name that a core package holds as an identifier or a string literal in a file that
// production code runs. Test files and test utilities are outside it.
export async function readNameLeaks(
  root: string,
  corePackageDirs: readonly string[],
  names: readonly string[],
  skip: readonly string[],
): Promise<NameLeak[]> {
  const files: string[] = [];

  for (const directory of corePackageDirs) {
    const entries = await readdir(join(root, directory, 'src'), { recursive: true });

    for (const entry of entries.toSorted()) {
      const file = `${directory}/src/${entry}`;

      if (isProductionSource(entry) && !skip.includes(file)) {
        files.push(file);
      }
    }
  }

  const sources = await Promise.all(
    files.map(async (file) => ({
      path: `/${file}`,
      source: await readFile(join(root, file), 'utf8'),
    })),
  );

  const trees = await readSyntaxTrees(sources);

  return trees.flatMap((tree) =>
    collectNameHits(tree, names).map((name) => ({ file: tree.fileName.slice(1), name })),
  );
}

function isProductionSource(entry: string): boolean {
  return (
    /\.tsx?$/u.test(entry) &&
    !/\.test\.tsx?$/u.test(entry) &&
    !entry.split('/').includes('test-utils')
  );
}
