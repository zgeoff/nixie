import type { DriveContext } from '@wringer/core';
import { WringerError } from '@wringer/core';
import { parseEnrolmentCode } from './parse-enrolment-code';
import { runHostCLI } from './run-host-cli';

// Issues a sign-in code with `nixie enrol-code` on the target's host.
export async function runEnrolCode(
  ctx: Pick<DriveContext, 'target' | 'endpoints' | 'exec'>,
): Promise<{ code: string }> {
  const printed = await runHostCLI(ctx, ['enrol-code']);

  const code = parseEnrolmentCode(printed);

  if (code === null) {
    throw new WringerError('check-failed', { message: 'nixie enrol-code printed no code' });
  }

  return { code };
}
