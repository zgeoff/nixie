import { startWriter } from '@heynixie/log';
import { createRunTemplate } from '@heynixie/testing';
import { createMigratedTemplate } from './write-migrated-data';

// The unit run starts its workers after this, so no test waits for the build or its lock.
export async function writeTestTemplates(): Promise<void> {
  await createMigratedTemplate({ createTemplate: createRunTemplate, startWriter });
}

if (import.meta.main) {
  await writeTestTemplates();
}
