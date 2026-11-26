import type { Logger } from '@heynixie/logger';
import { readPlanLogins } from '../login/read-plan-logins';
import type { PlanLoginsHolder, SpendGateway } from '../types';
import { pickStartRefusal } from './pick-start-refusal';

export interface SpendStartOptions {
  readonly gateway: SpendGateway;

  // where the read of the plan logins is held, which the spend context shares
  readonly planLogins: PlanLoginsHolder;
  readonly defaultZone: string;
  readonly credentialCount: number;
  readonly pathProfileIDs: readonly string[];
  readonly log: Logger;
}

// Checks the gateway before any work starts. A refusal throws and the server does not start. A
// gateway that does not answer, or that answers with its lost mark standing, lets it start, and the
// watcher stops nixie until the gateway answers or an operator clears the mark.
export async function checkSpendStart(
  options: SpendStartOptions,
): Promise<'answered' | 'unanswered'> {
  const refusal = pickStartRefusal({
    credentialCount: options.credentialCount,
    pathProfileIDs: options.pathProfileIDs,
    gatewayZone: null,
    defaultZone: options.defaultZone,
  });

  if (refusal !== null) {
    throw new Error(refusal);
  }

  const [status] = await Promise.all([options.gateway.readStatus(), readPlanLogins(options)]);

  if (status.kind === 'unreachable') {
    options.log('spend.gateway_unanswered', { reason: status.reason }, 'warn');

    return 'unanswered';
  }

  const zoneRefusal = pickStartRefusal({
    credentialCount: options.credentialCount,
    pathProfileIDs: options.pathProfileIDs,
    gatewayZone: status.value.zone,
    defaultZone: options.defaultZone,
  });

  if (zoneRefusal !== null) {
    throw new Error(zoneRefusal);
  }

  if (status.value.lost) {
    options.log('spend.gateway_lost', {}, 'warn');
  }

  return 'answered';
}
