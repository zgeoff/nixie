import type { ContractClient, LogRecord } from '@heynixie/contract';
import { waitForTurn } from './wait-for-turn';

interface ClientMessage {
  readonly text: string;

  readonly spans?: readonly {
    readonly start: number;
    readonly end: number;
    readonly source: 'typed' | 'pasted' | 'dropped' | 'unknown';
  }[];
}

export async function sendClientMessage(
  client: Pick<ContractClient, 'conversation'>,
  message: ClientMessage,
  replyText: string,
): Promise<readonly LogRecord[]> {
  const page: { records: readonly LogRecord[] } = { records: [] };

  const sent = await client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [...(message.spans ?? [])],
    text: message.text,
    thread: 'conversation',
  });

  await waitForTurn(async () => {
    const read = await client.conversation.read({ thread: 'conversation' });

    page.records = read.records;

    return page.records.some(
      (record) =>
        record.kind === 'model.reply' &&
        record.sequence > sent.sequence &&
        record.message?.text === replyText,
    );
  });

  return page.records;
}
