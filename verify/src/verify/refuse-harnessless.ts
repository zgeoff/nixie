import { WringerError } from '@wringer/core';

// The harness's control routes read these checks' state, and only `local` runs the harness.
export function refuseHarnessless(target: string, command: string): void {
  if (target !== 'local') {
    throw new WringerError('usage', {
      message: `\`${command}\` reads the harness, which only the local target runs`,
      hint: 'Run the journey with `--target local`.',
    });
  }
}
