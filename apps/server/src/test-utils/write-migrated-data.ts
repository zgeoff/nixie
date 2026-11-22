import { join } from 'node:path';
import type { StartWriterOptions, Writer } from '@heynixie/log';
import type { TestTemplateOptions } from '@heynixie/testing';

export interface MigratedDataIO {
  readonly createTemplate: (options: TestTemplateOptions) => Promise<string>;

  readonly startWriter: (options: StartWriterOptions) => Promise<Pick<Writer, 'stop'>>;

  readonly copyDirectory: (from: string, to: string) => Promise<void>;
}

const repoRoot = join(import.meta.dir, '..', '..', '..', '..');

export type MigratedTemplateIO = Pick<MigratedDataIO, 'createTemplate' | 'startWriter'>;

// Migrating an empty data directory costs an in-process start about 100 ms of CPU, measured on
// 2 vCPUs, so one writer per run migrates a template that each start copies. The test script builds
// it before the workers start, and the options live here so each start computes the same key.
export function createMigratedTemplate(io: MigratedTemplateIO): Promise<string> {
  return io.createTemplate({
    name: 'nixie-migrated-data',
    root: repoRoot,

    inputs: ['libs/db/src/**/*', 'modules/log/src/**/*', 'bun.lock'],
    write: async (building) => {
      const writer = await io.startWriter({ dataDir: building });

      await writer.stop();
    },
  });
}

export async function writeMigratedData(dataDir: string, io: MigratedDataIO): Promise<void> {
  const template = await createMigratedTemplate(io);

  await io.copyDirectory(template, dataDir);
}
