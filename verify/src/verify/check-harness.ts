import { WringerError } from '@wringer/core';
import type { HttpClient } from '@wringer/http';
import { controlRoutes } from './harness/control-routes';
import { postControl } from './post-control';

export async function checkHarness(client: HttpClient): Promise<{ commit: string }> {
  const health = await postControl(client, controlRoutes.health, {});

  if (!health.isNixieRunning) {
    throw new WringerError('check-failed', {
      message: 'nixie exited inside the harness',
      hint: 'Run `bun verify up --restart`, then `bun verify doctor`.',
    });
  }

  return { commit: 'worktree' };
}
