import type { MemoryKillRead } from './types';

export function parseMemoryKillsFile(text: string): MemoryKillRead {
  const trimmed = text.trim();

  return /^\d+$/u.test(trimmed) ? { kind: 'count', kills: Number(trimmed) } : { kind: 'failed' };
}
