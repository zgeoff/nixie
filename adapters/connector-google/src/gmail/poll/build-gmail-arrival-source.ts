import type { TriggerSource } from '@heynixie/connections';
import { gmailSourceID } from '../build-gmail-mailbox';
import { parseGmailSourceCursor } from './gmail-source-cursor';
import { runPollLoop } from './run-poll-loop';
import type { GmailArrivalSourceInput } from './types';

// The trigger source of the Gmail mail of each Google connection. It polls each live connection,
// one at a time, and delivers one batch for each poll with the whole cursor. It only reads Gmail,
// and a stop aborts the requests in flight.
export function buildGmailArrivalSource(input: GmailArrivalSourceInput): TriggerSource {
  let controller: AbortController | null = null;
  let loop: Promise<unknown> | null = null;

  return {
    id: gmailSourceID,
    kind: 'mail',
    start: (trigger) => {
      const running = new AbortController();

      controller = running;

      loop = runPollLoop({
        input,
        trigger,
        signal: AbortSignal.any([running.signal, trigger.signal]),
        cursor: parseGmailSourceCursor(trigger.cursor),
        states: new Map(),
      });

      return Promise.resolve();
    },
    stop: async () => {
      controller?.abort();

      await loop;
    },
  };
}
