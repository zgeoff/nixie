import type { MemoryTmpdirReads } from './read-memory-tmpdir';
import { readMemoryTmpdir } from './read-memory-tmpdir';

export function pointTmpdirAtMemory(
  environment: Record<string, string | undefined>,
  reads?: MemoryTmpdirReads,
): void {
  const memoryTmpdir = readMemoryTmpdir(reads);

  if (memoryTmpdir !== null) {
    environment['TMPDIR'] = memoryTmpdir;
  }
}
