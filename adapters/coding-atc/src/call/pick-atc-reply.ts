import type { AdapterReply } from '@heynixie/coding';

// What the adapter knows about the call that atc answered with a code.
export interface FailedCall {
  // atc's error code
  readonly code: string;

  // the call sent an idempotency key
  readonly isKeyed: boolean;

  // the fleet procedure, such as `session.spawn`
  readonly procedure: string;
}

type Failure = Exclude<AdapterReply<never>, { readonly status: 'ok' }>;

const retryableCodes = new Set([
  'target_unavailable',
  'host_unavailable',
  'timeout',
  'too_slow',
  'permission_pending',
  'protocol_mismatch',
]);

// One row of the table that maps atc's answers onto queue outcomes, in the design's order.
export function pickATCReply(call: FailedCall): Failure {
  if (call.code === 'outcome_unknown' || call.code === 'connection_lost') {
    return { status: 'unknown', reason: call.code };
  }

  if (call.code === 'daemon_unavailable') {
    return call.isKeyed
      ? { status: 'unknown', reason: call.code }
      : { status: 'refused', canClear: true, reason: call.code };
  }

  if (call.code === 'no_such_session' && call.procedure === 'session.spawn') {
    return { status: 'unknown', reason: call.code };
  }

  const canClear =
    retryableCodes.has(call.code) ||
    (call.code === 'host_leased' && call.procedure === 'session.kill');

  return { status: 'refused', canClear, reason: call.code };
}
