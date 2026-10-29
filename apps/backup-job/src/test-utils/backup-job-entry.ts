import { join } from 'node:path';

// the job's entry as source, which a suite in another package runs under its own Bun
export const backupJobEntry = join(import.meta.dir, '..', 'main.ts');
