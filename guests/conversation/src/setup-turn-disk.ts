import { mkdir } from 'node:fs/promises';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { removeStaleSessions } from './remove-stale-sessions';

// Prepares the guest's disk for a turn: the CLI's working directory exists, and the only session
// left is the one the turn resumes.
// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the SDK's options hold MCP configs that have no readonly form
export async function setupTurnDisk(
  options: Readonly<Options>,
  keep: string | null,
): Promise<void> {
  await mkdir(options.cwd ?? '', { recursive: true });
  await removeStaleSessions(options.env?.['CLAUDE_CONFIG_DIR'], keep);
}
