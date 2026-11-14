import type { JSONObject } from '@heynixie/log';
import type { PolicyFactsResolution } from '@heynixie/tools';
import type { WriteSource } from '../gate/gate-context';
import { isWriteRefusal } from '../utils/error/is-write-refusal';

export interface WriteFacts {
  readonly sources: readonly WriteSource[];
  readonly args: JSONObject;
}

// A refusal, such as an unknown item, reads as the tool's usual invalid-call error.
export async function resolveWriteFacts(
  read: () => Promise<WriteFacts>,
): Promise<PolicyFactsResolution> {
  try {
    return { status: 'ok', ...(await read()) };
  } catch (error) {
    if (isWriteRefusal(error)) {
      return { status: 'error', message: error.message };
    }

    throw error;
  }
}
