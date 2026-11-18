import type { Logger } from '@heynixie/logger';
import { readPlanLogins } from '../login/read-plan-logins';
import type { GatewayLimits, PlanLoginsHolder, SpendGateway } from '../types';
import { formatAboveCap, pickStartRefusal } from './pick-start-refusal';

export interface SpendLimitsOptions {
  readonly gateway: SpendGateway;

  // where the read of the plan logins is held, which the spend context shares
  readonly planLogins: PlanLoginsHolder;
  readonly limits: GatewayLimits;
  readonly defaultZone: string;
  readonly credentialCount: number;
  readonly pathProfileIDs: readonly string[];
  readonly log: Logger;
}

// Checks the gateway and sets its limits. A refusal throws and the server does not start. A gateway
// that does not answer lets the server start with its limits unsent, and the result says so: the
// watcher pauses nixie and sends the limits once the gateway answers.
export async function startSpendLimits(options: SpendLimitsOptions): Promise<'sent' | 'unsent'> {
  const refusal = pickStartRefusal({
    credentialCount: options.credentialCount,
    pathProfileIDs: options.pathProfileIDs,
    gatewayZone: null,
    defaultZone: options.defaultZone,
  });

  if (refusal !== null) {
    throw new Error(refusal);
  }

  const attempt = await tryLimits(options);

  if (attempt.kind === 'refused') {
    throw new Error(attempt.message);
  }

  if (attempt.kind === 'sent') {
    options.log('spend.limits_sent', {}, 'info');

    return 'sent';
  }

  options.log('spend.limits_unsent', { reason: attempt.reason }, 'warn');

  return 'unsent';
}

type Attempt =
  | { readonly kind: 'sent' }
  | { readonly kind: 'pending'; readonly reason: string }
  | { readonly kind: 'refused'; readonly message: string };

async function tryLimits(options: SpendLimitsOptions): Promise<Attempt> {
  const [status] = await Promise.all([options.gateway.readStatus(), readPlanLogins(options)]);

  if (status.kind === 'unreachable') {
    return { kind: 'pending', reason: status.reason };
  }

  const refusal = pickStartRefusal({
    credentialCount: options.credentialCount,
    pathProfileIDs: options.pathProfileIDs,
    gatewayZone: status.value.zone,
    defaultZone: options.defaultZone,
  });

  if (refusal !== null) {
    return { kind: 'refused', message: refusal };
  }

  const put = await options.gateway.putLimits(options.limits);

  if (put.kind === 'above_cap') {
    return { kind: 'refused', message: formatAboveCap(put) };
  }

  return put.kind === 'ok' ? { kind: 'sent' } : { kind: 'pending', reason: put.reason };
}
