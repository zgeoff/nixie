import { WringerError } from '@wringer/core';

// The prod reads go through the read-only token and the prod cluster's kubeconfig, which only the
// prod target uses.
export function refuseOffProd(target: string, command: string): void {
  if (target !== 'prod') {
    throw new WringerError('usage', {
      message: `\`${command}\` reads production nixie, which only the prod target reaches`,
      hint: 'Run the command with `--target prod`.',
    });
  }
}
