import type { ContractOutputs } from '@heynixie/contract';
import { readRecords } from '@heynixie/log';
import { toContractRecord } from '../contract/to-contract-record';
import type { APIContext } from '../types';
import { readRecordLookups } from './read-record-lookups';

type ReadPayloadOutput = ContractOutputs['records']['readPayload'];

export type RecordPayload = ReadPayloadOutput | { readonly status: 'not_found' };

interface PayloadTarget {
  readonly thread: string;
  readonly sequence: number;
}

// Reads the whole payload fields of one record at the time of the call, with no cut. A record
// of another thread reads as missing, so a caller reaches a record only through its thread.
export async function readRecordPayload(
  context: APIContext,
  target: PayloadTarget,
): Promise<RecordPayload> {
  const entries = await readRecords(context.log, {
    afterSequence: 0,
    limit: 1,
    sequences: [target.sequence],
    thread: target.thread,
  });

  const record = entries[0]?.record;

  if (record === undefined) {
    return { status: 'not_found' };
  }

  if (record.erasable.status === 'shredded') {
    return { status: 'forgotten' };
  }

  if (record.erasable.status === 'unreadable') {
    return { status: 'unreadable' };
  }

  const lookups = await readRecordLookups(context, [record]);

  const visible = toContractRecord(record, lookups);

  if (visible === null) {
    return { status: 'not_found' };
  }

  return {
    status: 'readable',
    ...(visible.toolCall === undefined
      ? {}
      : {
          toolCall: {
            ...(visible.toolCall.input === undefined ? {} : { input: visible.toolCall.input }),
            ...(visible.toolCall.content === undefined
              ? {}
              : { content: visible.toolCall.content }),
          },
        }),
    ...(visible.worker === undefined ? {} : { worker: pickWorkerPayload(visible.worker) }),
  };
}

type Visible = NonNullable<ReturnType<typeof toContractRecord>>;

function pickWorkerPayload(worker: NonNullable<Visible['worker']>): {
  text?: string;
  detail?: string;
} {
  if (worker.phase === 'turn' && worker.text !== undefined) {
    return { text: worker.text };
  }

  if (worker.phase === 'ended' && worker.detail !== undefined) {
    return { detail: worker.detail };
  }

  return {};
}
