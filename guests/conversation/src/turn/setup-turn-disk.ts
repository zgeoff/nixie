import { mkdir } from 'node:fs/promises';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { removeStaleSessions } from './remove-stale-sessions';

export async function setupTurnDisk(
  options: Readonly<Options>,
  keep: string | null,
): Promise<void> {
  await mkdir(options.cwd ?? '', { recursive: true });
  await removeStaleSessions(options.env?.['CLAUDE_CONFIG_DIR'], keep);
}
