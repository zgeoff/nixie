import type { ContractClient, LogRecord } from '@heynixie/contract';
import { waitForCondition } from '@heynixie/testing';

interface ClientMessage {
  readonly text: string;

  // how each part of the text arrived, none by default
  readonly spans?: readonly {
    readonly start: number;
    readonly end: number;
    readonly source: 'typed' | 'pasted' | 'dropped' | 'unknown';
  }[];
}

// Sends the message on the conversation thread through a signed-in client, waits for a model reply
// with the reply's text after the message, and returns the thread's records as they stood then.
export async function sendClientMessage(
  client: Pick<ContractClient, 'conversation'>,
  message: ClientMessage,
  replyText: string,
): Promise<readonly LogRecord[]> {
  const page = { records: [] as readonly LogRecord[] };

  const sent = await client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [...(message.spans ?? [])],
    text: message.text,
    thread: 'conversation',
  });
  await waitForCondition(
    async () => {
      const read = await client.conversation.read({ thread: 'conversation' });

      page.records = read.records;

      return page.records.some(
        (record) =>
          record.kind === 'model.reply' &&
          record.sequence > sent.sequence &&
          record.message?.text === replyText,
      );
    },
    { timeoutMs: 30_000 },
  );
  return page.records;
}
