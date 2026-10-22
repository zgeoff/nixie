import type { MemoryTmpdirReads } from './read-memory-tmpdir';
import { readMemoryTmpdir } from './read-memory-tmpdir';

export function pointTmpdirAtMemory(
  env: Record<string, string | undefined>,
  reads?: MemoryTmpdirReads,
): void {
  const memoryTmpdir = readMemoryTmpdir(reads);

  if (memoryTmpdir !== null) {
    env['TMPDIR'] = memoryTmpdir;
  }
}
