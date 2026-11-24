import type { DriveContext } from '@wringer/core';
import { runHostCLI } from './run-host-cli';

// Pauses or resumes nixie with the host command, as a client with no browser tab does.
export async function runPauseFromHost(
  ctx: Pick<DriveContext, 'target' | 'endpoints' | 'exec'>,
  state: 'paused' | 'running',
): Promise<Record<string, never>> {
  await runHostCLI(ctx, [state === 'paused' ? 'pause' : 'resume']);

  return {};
}
