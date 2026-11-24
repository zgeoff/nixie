import type { DriveContext } from '@wringer/core';
import { WringerError } from '@wringer/core';
import { runHostCLI } from './run-host-cli';
import { sessionsSchema } from './sessions-schema';

// Reads `nixie sessions`, and fails with `check-failed` when no session has the device name.
export async function readSessionCheck(
  ctx: Pick<DriveContext, 'target' | 'endpoints' | 'exec'>,
  device: string,
) {
  const printed = await runHostCLI(ctx, ['sessions']);

  const sessions = sessionsSchema.parse(JSON.parse(printed));

  if (!sessions.some((session) => session.deviceName === device)) {
    throw new WringerError('check-failed', {
      message: `no session has the device name ${device}`,
      data: { sessions },
    });
  }

  return { sessions };
}
