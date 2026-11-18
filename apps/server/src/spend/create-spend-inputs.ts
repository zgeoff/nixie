import type { PlanLoginsHolder, SpendGateway } from '@heynixie/spend';
import { createPlanLoginsHolder } from '@heynixie/spend';
import { createSpendGateway } from '@heynixie/spend-model-gateway';
import type { SpendSettings } from './resolve-spend-settings';
import { resolveSpendSettings } from './resolve-spend-settings';
import type { SpendStopConfig } from './spend-stop-schema';

export interface SpendInputs extends SpendSettings {
  readonly gateway: SpendGateway;

  // the server's last read of the gateway's plan logins, which the spend context shares
  readonly planLogins: PlanLoginsHolder;
}

export function createSpendInputs(
  config: SpendStopConfig | undefined,
  settings: Readonly<Record<string, string>>,
): SpendInputs | null {
  const resolved = resolveSpendSettings(config, settings);

  if (resolved === null) {
    return null;
  }

  return {
    ...resolved,
    gateway: createSpendGateway({ url: resolved.control, token: resolved.token }),
    planLogins: createPlanLoginsHolder(),
  };
}
