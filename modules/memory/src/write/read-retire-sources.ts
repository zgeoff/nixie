import { readQuoteEvidence } from '../evidence/read-quote-evidence';
import type { GatedRetireRequest, WriteSource } from '../gate/gate-context';
import type { StoreParts } from '../types';
import { pickWriteSources } from './pick-write-sources';

export async function readRetireSources(
  parts: StoreParts,
  request: GatedRetireRequest,
): Promise<readonly WriteSource[]> {
  const quote = request.intentQuote;

  const found =
    quote === undefined
      ? null
      : await readQuoteEvidence(parts.context.log, {
          thread: request.caller.thread,
          quote,
          window: parts.context.gate.limits.evidenceWindow,
        });

  return pickWriteSources(found?.status === 'found', request.caller);
}
