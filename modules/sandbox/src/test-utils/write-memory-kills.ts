import { memoryKillsPath } from '../memory-kills-path';
import type { Sandbox } from '../types';

export function writeMemoryKills(sandbox: Sandbox, kills: number): Promise<void> {
  if (!Number.isSafeInteger(kills) || kills < 0) {
    throw new Error(`a memory kill count is a safe whole number of 0 or more, not ${kills}`);
  }

  return sandbox.copyIn([
    { path: memoryKillsPath, content: new TextEncoder().encode(String(kills)) },
  ]);
}
