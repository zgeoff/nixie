import { writeRecords } from '@heynixie/log';
import type { StartedMemoryStore } from '@heynixie/memory';
import invariant from 'tiny-invariant';
import type { APIContext } from '../types';

export interface QuotedMemoryItems {
  // the message that the first item quotes
  readonly sequence: number;

  // an item of 2 versions whose first version quotes the message
  readonly quoting: { readonly itemID: string; readonly version: number };

  // an item that quotes another message
  readonly unrelated: { readonly itemID: string; readonly version: number };
}

const provenance = {
  origin: 'owner',
  source: 'owner',
  taskID: null,
  proposalID: null,
  checks: null,
} as const;

export async function seedQuotedMemoryItems(
  context: Pick<APIContext, 'log'>,
  memory: StartedMemoryStore,
): Promise<QuotedMemoryItems> {
  const [message, other] = await writeRecords(context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'The cat learned the flap today' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Then it went out' },
    },
  ]);

  invariant(message && other, 'the log wrote no owner_message records');

  const first = await memory.remember({
    text: 'The cat uses the flap',
    evidence: { recordSequence: message.sequence, start: 0, end: 7 },
    evidenceQuote: 'The cat',
    provenance,
  });

  const quoting = await memory.remember({
    text: 'The cat uses the flap every night',
    target: first,
    provenance,
  });

  const unrelated = await memory.remember({
    text: 'The cat goes out at night',
    evidence: { recordSequence: other.sequence, start: 0, end: 4 },
    evidenceQuote: 'Then',
    provenance,
  });

  return { sequence: message.sequence, quoting, unrelated };
}
