import { setTimeout as sleep } from 'node:timers/promises';
import type { Logger } from '@heynixie/logger';
import type { GatewayLimits, SpendGateway } from '../types';
import { formatAboveCap, pickStartRefusal } from './pick-start-refusal';

export interface SpendLimitsOptions {
  readonly gateway: SpendGateway;
  readonly limits: GatewayLimits;
  readonly defaultZone: string;
  readonly credentialCount: number;
  readonly log: Logger;
  readonly signal: AbortSignal;

  // how long to wait between the sends of a gateway that does not answer
  readonly retryMs?: number;
}

// Checks the gateway and sets its limits. A refusal throws and the server does not start. A gateway
// that does not answer lets the server start, and the limits go out once it answers. Until they do,
// the gateway holds no limit and refuses every model request.
export async function startSpendLimits(options: SpendLimitsOptions): Promise<void> {
  const refusal = pickStartRefusal({
    credentialCount: options.credentialCount,
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

    return;
  }

  options.log('spend.limits_unsent', { reason: attempt.reason }, 'warn');
  void runLimitsRetries(options);
}

type Attempt =
  | { readonly kind: 'sent' }
  | { readonly kind: 'pending'; readonly reason: string }
  | { readonly kind: 'refused'; readonly message: string };

async function tryLimits(options: SpendLimitsOptions): Promise<Attempt> {
  const status = await options.gateway.readStatus();

  if (status.kind === 'unreachable') {
    return { kind: 'pending', reason: status.reason };
  }

  const refusal = pickStartRefusal({
    credentialCount: options.credentialCount,
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

const defaultRetryMs = 5000;

async function runLimitsRetries(options: SpendLimitsOptions): Promise<void> {
  while (!options.signal.aborted) {
    try {
      await sleep(options.retryMs ?? defaultRetryMs, undefined, { signal: options.signal });
    } catch {
      return;
    }

    const attempt = await tryLimits(options);

    if (attempt.kind === 'sent') {
      options.log('spend.limits_sent', {}, 'info');

      return;
    }

    if (attempt.kind === 'refused') {
      options.log('spend.limits_refused', { reason: attempt.message }, 'error');

      return;
    }
  }
}
