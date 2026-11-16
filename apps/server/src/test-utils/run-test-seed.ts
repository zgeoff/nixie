import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SeedResult } from '@heynixie/definitions';
import { createPathSource, runSeed } from '@heynixie/definitions';
import { buildTestTaskSeed } from '@heynixie/definitions/test-utils';
import type { Log } from '@heynixie/log';

export async function runTestSeed(log: Log, directory: string): Promise<SeedResult> {
  const root = join(directory, 'definitions');

  await mkdir(root);
  await writeFile(join(root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(root, 'persona.md'), '# Persona\n\nPlain and kind.\n');

  return runSeed({
    tasks: buildTestTaskSeed(),
    log,
    source: createPathSource({ directory: root }),
    buildPolicy: () => ({ rules: [], tools: [] }),
  });
}
