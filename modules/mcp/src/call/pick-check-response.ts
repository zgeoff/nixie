import type { CheckResponse } from '@heynixie/connectors';
import type { JSONValue } from '@heynixie/log';
import type { ProxiedCallResult } from './run-proxied-call';

// What the read tool of a check found. A result with content counts as done and an empty one as not
// done, unless it holds pictures, which prove nothing. A call that never reached the server, failed,
// or ended in an error of the server's says nothing either way.
export function pickCheckResponse(result: ProxiedCallResult | null): CheckResponse {
  if (result?.kind !== 'answered') {
    return { kind: 'inconclusive' };
  }

  const outcome = result.outcome;

  if (outcome.status === 'error' || outcome.isError === true) {
    return { kind: 'inconclusive' };
  }

  if (Object.values(outcome.result).every((value) => isEmpty(value))) {
    // a result of pictures alone holds nothing the proxy can read, so it proves no absence
    return (outcome.images?.length ?? 0) > 0 ? { kind: 'inconclusive' } : { kind: 'not_found' };
  }

  return { kind: 'found', result: outcome.result };
}

function isEmpty(value: JSONValue): boolean {
  if (value === null) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim() === '';
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return typeof value === 'object' && Object.keys(value).length === 0;
}
