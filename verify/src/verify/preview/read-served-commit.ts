import { WringerError } from '@wringer/core';
import type { Host } from '@wringer/core';
import { previewCheckout } from './preview-checkout';

export const servedCommitArgv = ['git', '-C', previewCheckout, 'rev-parse', 'HEAD'];

// A failed read means the preview has not finished building, so the agent rebuilds it. A plain
// error here would reach the agent as `internal`, which says the CLI has a bug.
export async function readServedCommit(host: Pick<Host, 'run'>): Promise<string> {
  const ran = await host.run({ argv: servedCommitArgv, access: 'read-only' });

  if (ran.exitCode !== 0) {
    throw new WringerError('environment', {
      message: `the preview's checkout has no commit: ${ran.stderr.trim()}`,
      hint: 'Open the preview link on the pull request, wait for the preview to serve, then run `bun verify attach` again.',
    });
  }

  return ran.stdout.trim();
}
