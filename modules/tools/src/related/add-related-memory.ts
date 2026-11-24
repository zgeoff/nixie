import { toErrorFields } from '@heynixie/logger';
import type { ToolOutcome } from '../types';
import type { RelatedMemoryLookup } from './types';

export interface RelatedMemoryRequest {
  readonly callID: string;

  // the call's text arguments, joined
  readonly text: string;
}

// Adds the memory that the call's text touches to an applied result, as `related`. The call has
// applied by now, so a lookup that fails only logs: it never holds, refuses or fails the call.
export async function addRelatedMemory(
  outcome: ToolOutcome,
  lookup: RelatedMemoryLookup | undefined,
  request: RelatedMemoryRequest,
): Promise<ToolOutcome> {
  if (lookup === undefined || outcome.status !== 'ok' || outcome.refusalCode !== undefined) {
    return outcome;
  }

  try {
    const related = await lookup.read(request.text);

    return related.length === 0
      ? outcome
      : {
          ...outcome,
          result: {
            ...outcome.result,
            related: related.map((item) => ({ shortID: item.shortID, text: item.text })),
          },
        };
  } catch (error) {
    lookup.log(
      'tool.related_memory_failed',
      { callID: request.callID, ...toErrorFields(error) },
      'error',
    );

    return outcome;
  }
}
