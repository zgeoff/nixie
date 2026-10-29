import { join } from 'node:path';
import type { StartWriterOptions, Writer } from '@heynixie/log';
import type { RunTemplateOptions } from '@heynixie/testing';

export interface MigratedDataIO {
  readonly createTemplate: (options: RunTemplateOptions) => Promise<string>;

  readonly startWriter: (options: StartWriterOptions) => Promise<Pick<Writer, 'stop'>>;

  readonly copyDirectory: (from: string, to: string) => Promise<void>;
}

const repoRoot = join(import.meta.dir, '..', '..', '..', '..');

// Migrating an empty data directory costs an in-process start about 100 ms of CPU, measured on
// 2 vCPUs, so one writer per run migrates a template that each start copies.
export async function writeMigratedData(dataDir: string, io: MigratedDataIO): Promise<void> {
  const template = await io.createTemplate({
    name: 'nixie-migrated-data',
    root: repoRoot,

    // a checkout with other database sources would replace a template in a shared folder while a
    // start in this checkout copies it
    parentDir: join(repoRoot, 'node_modules', '.cache', 'nixie-run-templates'),
    inputs: ['libs/db/src/**/*', 'modules/log/src/**/*', 'bun.lock'],
    write: async (building) => {
      const writer = await io.startWriter({ dataDir: building });

      await writer.stop();
    },
  });

  await io.copyDirectory(template, dataDir);
}
