import type { Log } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import type { SandboxAdapter } from '../types';
import { collectUnheldSecrets } from './collect-unheld-secrets';
import { readGrantSecretNames } from './read-grant-secret-names';
import { readLiveGrantNames } from './read-live-grant-names';

export interface UnheldSecretsOptions {
  readonly log: Pick<Log, 'deploymentKey' | 'writer'>;
  readonly logger: Logger;
  readonly adapter: Pick<SandboxAdapter, 'id' | 'removeSecret'>;

  // the names the config's host-held profiles give, which cleanup never removes
  readonly hostHeldNames: readonly string[];
}

// Removes from the broker each secret that nixie added and no live sandbox holds. A name it never
// added stays, so a secret an operator or another system put there is safe.
export async function removeUnheldSecrets(
  options: UnheldSecretsOptions,
): Promise<readonly string[]> {
  const unheld = collectUnheldSecrets({
    added: await readGrantSecretNames(options.log),
    live: await readLiveGrantNames(options.log, options.adapter.id),
    hostHeld: options.hostHeldNames,
  });

  const removed: string[] = [];

  for (const name of unheld) {
    try {
      await options.adapter.removeSecret(name);

      removed.push(name);
    } catch (error) {
      options.logger(
        'sandbox.secret_remove_failed',
        { secret: name, reason: error instanceof Error ? error.message : String(error) },
        'warn',
      );
    }
  }

  return removed;
}
