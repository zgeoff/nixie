import { startSpendLimits } from '@heynixie/spend';
import type { ServerInputs } from '../server/load-server-inputs';
import type { Cleanup } from '../types';

// With spendStop set, the gateway counts every model request, so the server checks it before any
// work starts.
export async function startSpendChecks(inputs: ServerInputs, cleanup: Cleanup): Promise<void> {
  if (inputs.spend === null) {
    return;
  }

  const models = inputs.config.models.limits;

  await startSpendLimits({
    gateway: inputs.spend.gateway,
    limits: {
      day: { dollars: models.day.dollars, tokens: models.day.tokens },
      month: { dollars: models.month.dollars, tokens: models.month.tokens },
    },
    defaultZone: inputs.config.time.default_zone,
    credentialCount: Object.keys(inputs.secrets.models.model_credentials ?? {}).length,
    log: inputs.log,
    signal: cleanup.signal,
  });
}
