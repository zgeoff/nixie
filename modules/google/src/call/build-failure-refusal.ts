import type { ConnectorFailure } from '@heynixie/tools';

interface FailureRefusal {
  readonly status: 'error';
  readonly message: string;
  readonly failure: ConnectorFailure;
}

export function buildFailureRefusal(failure: ConnectorFailure): FailureRefusal {
  return { status: 'error', message: failure.detail ?? failure.code, failure };
}
