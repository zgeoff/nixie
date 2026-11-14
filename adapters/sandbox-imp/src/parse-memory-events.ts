import type { MemoryKillRead } from '@heynixie/sandbox';

export function parseMemoryEvents(text: string): MemoryKillRead {
  const kills = /^oom_kill (?<kills>\d+)$/mu.exec(text)?.groups?.['kills'];

  return kills === undefined ? { kind: 'unsupported' } : { kind: 'count', kills: Number(kills) };
}
