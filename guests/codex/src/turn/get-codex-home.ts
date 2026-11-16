import { join } from 'node:path';

// The folder that holds the CLI's config and its session state
export function getCodexHome(home: string): string {
  return join(home, '.codex');
}
