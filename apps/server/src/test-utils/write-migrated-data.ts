import { cp } from 'node:fs/promises';
import { join } from 'node:path';
import { startWriter } from '@heynixie/log';
import { createRunTemplate } from '@heynixie/testing';

const repoRoot = join(import.meta.dir, '..', '..', '..', '..');

// Migrating an empty data directory costs an in-process start about 100 ms of CPU, measured on
// 2 vCPUs, so one writer per run migrates a template that each start copies.
export async function writeMigratedData(dataDir: string): Promise<void> {
  const template = await createRunTemplate({
    name: 'nixie-migrated-data',
    root: repoRoot,

    // a checkout with other database sources would replace a template in a shared folder while a
    // start in this checkout copies it
    parentDir: join(repoRoot, 'node_modules', '.cache', 'nixie-run-templates'),
    inputs: ['{libs/db,modules/log}/src/**/*', 'bun.lock'],
    write: async (building) => {
      const writer = await startWriter({ dataDir: building });

      await writer.stop();
    },
  });

  await cp(template, dataDir, { recursive: true });
}
