import { CredentialRefusalError } from '@heynixie/egress';
import type { ConnectorFailure } from '../types';

export interface FetchRefusal {
  readonly status: 'error';
  readonly message: string;
  readonly failure: ConnectorFailure;
}

// Runs a step that reads from a provider before the call, such as the read that prepares a queued
// action. The fetcher's refusal of the step's request ends the call as a failure, and any other
// throw goes on.
export async function catchFetchRefusal<Result>(
  step: () => Promise<Result>,
): Promise<Result | FetchRefusal> {
  try {
    return await step();
  } catch (error) {
    if (error instanceof CredentialRefusalError) {
      return {
        status: 'error',
        message: 'fetch_refused',
        failure: { code: 'fetch_refused', detail: error.message },
      };
    }

    throw error;
  }
}
