import type { MemoryKillRead } from './types';

export function parseMemoryKillsFile(text: string): MemoryKillRead {
  const trimmed = text.trim();
  const kills = Number(trimmed);

  return /^\d+$/u.test(trimmed) && Number.isSafeInteger(kills)
    ? { kind: 'count', kills }
    : { kind: 'failed' };
}
