import { readEventEvidence } from '../evidence/read-event-evidence';
import { readQuoteEvidence } from '../evidence/read-quote-evidence';
import type { GatedRememberRequest, WriteSource } from '../gate/gate-context';
import type { StoreParts } from '../types';
import { pickWriteSources } from './pick-write-sources';
import { readItemSubject } from './read-item-subject';

export async function readRememberSources(
  parts: StoreParts,
  request: GatedRememberRequest,
): Promise<readonly WriteSource[]> {
  const isOwnerQuote = await probeRememberQuote(parts, request);

  return pickWriteSources(isOwnerQuote, request.caller);
}

async function probeRememberQuote(
  parts: StoreParts,
  request: GatedRememberRequest,
): Promise<boolean> {
  const quote = request.quote;

  if (quote === undefined || request.image !== undefined) {
    return false;
  }

  const itemSubject =
    request.target === undefined ? 'owner' : await readItemSubject(parts, request.target.itemID);

  if ((request.subject ?? itemSubject) === 'self') {
    return false;
  }

  const log = parts.context.log;

  const found =
    request.eventID === undefined
      ? await readQuoteEvidence(log, {
          thread: request.caller.thread,
          quote,
          window: parts.context.gate.limits.evidenceWindow,
        })
      : await readEventEvidence(log, {
          thread: request.caller.logThread,
          quote,
          eventID: request.eventID,
        });

  return found.status === 'found';
}
