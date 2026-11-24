import { toErrorFields } from '@heynixie/logger';
import type { ToolOutcome } from '../types';
import type { RelatedMemoryItem, RelatedMemoryLookup } from './types';

export interface RelatedMemoryRequest {
  readonly callID: string;

  // the call's text arguments, joined
  readonly text: string;
}

// Adds the memory that the call's text touches to an applied result, as `related`. A lookup that
// fails or runs past its deadline only logs. The stored record keeps the result without `related`,
// so a forget leaves no copy of an item's text.
export async function addRelatedMemory(
  outcome: ToolOutcome,
  lookup: RelatedMemoryLookup | undefined,
  request: RelatedMemoryRequest,
): Promise<ToolOutcome> {
  if (lookup === undefined || outcome.status !== 'ok' || outcome.refusalCode !== undefined) {
    return outcome;
  }

  try {
    const related = await readWithin(lookup, request.text);

    return related.length === 0
      ? outcome
      : {
          ...outcome,
          record: outcome.record ?? outcome.result,
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

async function readWithin(
  lookup: RelatedMemoryLookup,
  text: string,
): Promise<readonly RelatedMemoryItem[]> {
  const deadline = Promise.withResolvers<never>();

  const timer = setTimeout(() => {
    deadline.reject(new Error(`the lookup ran past ${String(lookup.timeoutMs)} ms`));
  }, lookup.timeoutMs);

  try {
    return await Promise.race([lookup.read(text), deadline.promise]);
  } finally {
    clearTimeout(timer);
  }
}
