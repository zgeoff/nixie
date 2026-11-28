import type { ContractClient } from '@heynixie/contract';

export interface SeenRecords {
  sequence: number;
}

// Each record on the conversation thread, in the order nixie wrote them, after the last one seen.
export async function writeRecordLines(
  client: ContractClient,
  signal: AbortSignal,
  seen: SeenRecords,
): Promise<void> {
  const records = await client.live.follow(
    { afterSequence: seen.sequence, thread: 'conversation' },
    { signal },
  );

  for await (const event of records) {
    if (event.kind !== 'record') {
      continue;
    }

    seen.sequence = event.record.sequence;

    const line = {
      event: 'record',
      sequence: event.record.sequence,
      kind: event.record.kind,
      text: event.record.message?.text ?? null,
      voidedReply: event.record.voidedReply?.sequence ?? null,
    };

    process.stdout.write(`${JSON.stringify(line)}\n`);
  }
}
