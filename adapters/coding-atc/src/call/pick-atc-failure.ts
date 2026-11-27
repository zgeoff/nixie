import type { AdapterReply } from '@heynixie/coding';
import { pickATCReply } from './pick-atc-reply';

type Failure = Exclude<AdapterReply<never>, { readonly status: 'ok' }>;

// What the adapter knows about the call that threw.
export interface ThrownCall {
  // the fleet procedure, such as `session.spawn`
  readonly procedure: string;

  // the call sent an idempotency key
  readonly isKeyed: boolean;
}

// A line typed into a session may have reached the terminal when a proxy answers with an error, and
// the call has no key to make a resend safe, so its failure is never a refusal.
const typingProcedure = 'session.submit';

// The reply for a call that threw. atc's typed errors keep their `code`; the client itself throws
// `UNAUTHORIZED` for an HTTP 401 and `FORBIDDEN` for a refused host. Anything that is no oRPC
// error came from the network.
export function pickATCFailure(error: unknown, call: ThrownCall): Failure {
  const code = findORPCCode(error);

  if (code === null) {
    return pickNetworkFailure(error);
  }

  if (code === 'UNAUTHORIZED') {
    return { status: 'refused', canClear: true, reason: 'bearer_refused' };
  }

  if (code === 'FORBIDDEN') {
    return { status: 'refused', canClear: false, reason: 'forbidden' };
  }

  if (code === code.toUpperCase()) {
    return call.isKeyed || call.procedure === typingProcedure
      ? { status: 'unknown', reason: 'gateway_failed' }
      : { status: 'refused', canClear: true, reason: 'gateway_failed' };
  }

  return pickATCReply({ code, isKeyed: call.isKeyed, procedure: call.procedure });
}

// The code of an error that oRPC raised, which carries `defined` and `code` and never a socket's
// error code.
function findORPCCode(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const code: unknown = Reflect.get(error, 'code');
  const defined: unknown = Reflect.get(error, 'defined');

  return typeof code === 'string' && typeof defined === 'boolean' ? code : null;
}

// Errors of a connect that never reached the gateway, so the call cannot have run.
const unreachableCodes = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);

function pickNetworkFailure(error: unknown): Failure {
  const code: unknown = error instanceof Error ? Reflect.get(error, 'code') : undefined;

  return typeof code === 'string' && unreachableCodes.has(code)
    ? { status: 'refused', canClear: true, reason: 'unreachable' }
    : { status: 'unknown', reason: 'connection_lost' };
}
