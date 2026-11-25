import type { CredentialAccess } from '@heynixie/credentials';
import type { PlanLoginsHolder, SpendGateway } from '@heynixie/spend';
import { createPlanLoginsHolder } from '@heynixie/spend';
import { createSpendGateway } from '@heynixie/spend-model-gateway';
import invariant from 'tiny-invariant';
import type { SpendStopConfig } from './spend-stop-schema';

export interface SpendInputs {
  readonly control: string;
  readonly modelURL: string;
  readonly gateway: SpendGateway;

  // the server's last read of the gateway's plan logins, which the spend context shares
  readonly planLogins: PlanLoginsHolder;
}

// The deployment runs the gateway and names its control URL in the config, so only this fetcher
// takes http and a private address.
export function createSpendInputs(
  config: SpendStopConfig | undefined,
  credentials: CredentialAccess,
): SpendInputs | null {
  if (config === undefined) {
    return null;
  }

  const ref = credentials.resolveCredential({
    class: 'setting',
    reference: config.token,
    configKey: 'spendStop.token',
  });

  invariant(ref !== null, 'the resolver stops at a missing setting entry');

  const origin = new URL(config.control).origin;

  const binding = credentials.store.register(ref, {
    kind: 'static',
    label: 'spend gateway',
    origins: [origin],
  });

  return {
    control: config.control,
    modelURL: config.modelURL,
    gateway: createSpendGateway({
      url: config.control,
      fetch: credentials.store.fetcher(binding, [origin], { deploymentService: true }),
    }),
    planLogins: createPlanLoginsHolder(),
  };
}
