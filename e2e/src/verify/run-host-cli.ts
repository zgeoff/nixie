import type { DriveContext } from '@wringer/core';
import { WringerError } from '@wringer/core';
import { buildHostCLIArgv } from './build-host-cli-argv';

// Runs one `nixie` host command on the target's host, and returns what it printed.
export async function runHostCLI(
  ctx: Pick<DriveContext, 'target' | 'endpoints' | 'exec'>,
  args: readonly string[],
): Promise<string> {
  const ran = await ctx.exec(buildHostCLIArgv(ctx.target, ctx.endpoints, args));

  if (ran.exitCode !== 0) {
    throw new WringerError('check-failed', {
      message: `nixie ${args.join(' ')} exited ${String(ran.exitCode)}: ${ran.stderr.trim()}`,
    });
  }

  return ran.stdout;
}
