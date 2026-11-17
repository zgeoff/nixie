import type { Logger } from '@heynixie/logger';
import type { ModelSecrets, ModelsConfig } from '@heynixie/models';
import { startSpendLimits } from '@heynixie/spend';
import type { SpendInputs } from './create-spend-inputs';

export interface SpendChecksInputs {
  readonly spend: SpendInputs | null;
  readonly config: {
    readonly models: Pick<ModelsConfig, 'limits' | 'profiles'>;
    readonly time: { readonly default_zone: string };
  };
  readonly secrets: { readonly models: ModelSecrets };
  readonly log: Logger;
}

// With spendStop set, the gateway counts every model request, so the server checks it before any
// work starts. Without it, nothing runs. The result says whether the gateway got its limits.
export function startSpendChecks(inputs: SpendChecksInputs): Promise<'off' | 'sent' | 'unsent'> {
  if (inputs.spend === null) {
    return Promise.resolve('off');
  }

  const limits = inputs.config.models.limits;

  return startSpendLimits({
    gateway: inputs.spend.gateway,
    limits: {
      day: { dollars: limits.day.dollars, tokens: limits.day.tokens },
      month: { dollars: limits.month.dollars, tokens: limits.month.tokens },
    },
    defaultZone: inputs.config.time.default_zone,
    credentialCount: Object.keys(inputs.secrets.models.model_credentials ?? {}).length,
    pathProfileIDs: collectPathProfileIDs(inputs.config.models.profiles),
    log: inputs.log,
  });
}

function collectPathProfileIDs(profiles: ModelsConfig['profiles']): string[] {
  return Object.values(profiles)
    .filter((profile) => new URL(profile.baseURL).pathname.replace(/\/+$/u, '') !== '')
    .map((profile) => profile.id);
}
