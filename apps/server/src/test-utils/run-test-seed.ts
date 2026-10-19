import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SeedResult } from '@heynixie/definitions';
import { createPathSource, runSeed } from '@heynixie/definitions';
import type { Log } from '@heynixie/log';

// Seeds the log from a definitions root it writes in directory, with a one-line persona and no rules, as
// every start seeds before anything else writes, and returns the seed's result.
export async function runTestSeed(log: Log, directory: string): Promise<SeedResult> {
  const root = join(directory, 'definitions');

  await mkdir(root);
  await writeFile(join(root, 'nixie.yaml'), 'format: 1\n');
  await writeFile(join(root, 'persona.md'), '# Persona\n\nPlain and kind.\n');

  return runSeed({
    log,
    source: createPathSource({ directory: root }),
    policy: { rules: [], tools: [] },
  });
}
