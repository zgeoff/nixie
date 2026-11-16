import type { Logger } from '@heynixie/logger';
import type { ModelSecrets, ModelsConfig } from '@heynixie/models';
import { startSpendLimits } from '@heynixie/spend';
import type { SpendInputs } from './create-spend-inputs';

export interface SpendChecksInputs {
  readonly spend: SpendInputs | null;
  readonly config: {
    readonly models: Pick<ModelsConfig, 'limits'>;
    readonly time: { readonly default_zone: string };
  };
  readonly secrets: { readonly models: ModelSecrets };
  readonly log: Logger;
}

// With spendStop set, the gateway counts every model request, so the server checks it before any
// work starts. Without it, nothing runs.
export async function startSpendChecks(
  inputs: SpendChecksInputs,
  signal: AbortSignal,
): Promise<void> {
  if (inputs.spend === null) {
    return;
  }

  const limits = inputs.config.models.limits;

  await startSpendLimits({
    gateway: inputs.spend.gateway,
    limits: {
      day: { dollars: limits.day.dollars, tokens: limits.day.tokens },
      month: { dollars: limits.month.dollars, tokens: limits.month.tokens },
    },
    defaultZone: inputs.config.time.default_zone,
    credentialCount: Object.keys(inputs.secrets.models.model_credentials ?? {}).length,
    log: inputs.log,
    signal,
  });
}
