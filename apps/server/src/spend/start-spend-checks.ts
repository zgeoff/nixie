import type { Logger } from '@heynixie/logger';
import type { ModelsConfig } from '@heynixie/models';
import { checkSpendStart } from '@heynixie/spend';
import type { SpendInputs } from './create-spend-inputs';

export interface SpendChecksInputs {
  readonly spend: SpendInputs | null;
  readonly config: {
    readonly models: Pick<ModelsConfig, 'profiles'>;
    readonly time: { readonly default_zone: string };
  };
  readonly secrets: { readonly modelCredentialCount: number };
  readonly log: Logger;
}

// With spendStop set, the gateway counts every model request, so the server checks it before any
// work starts. Without it, nothing runs. The result says whether the gateway answered.
export function startSpendChecks(
  inputs: SpendChecksInputs,
): Promise<'off' | 'answered' | 'unanswered'> {
  if (inputs.spend === null) {
    return Promise.resolve('off');
  }

  return checkSpendStart({
    gateway: inputs.spend.gateway,
    planLogins: inputs.spend.planLogins,
    defaultZone: inputs.config.time.default_zone,
    credentialCount: inputs.secrets.modelCredentialCount,
    pathProfileIDs: collectPathProfileIDs(inputs.config.models.profiles),
    log: inputs.log,
  });
}

function collectPathProfileIDs(profiles: ModelsConfig['profiles']): string[] {
  return Object.values(profiles)
    .filter((profile) => new URL(profile.baseURL).pathname.replace(/\/+$/u, '') !== '')
    .map((profile) => profile.id);
}
