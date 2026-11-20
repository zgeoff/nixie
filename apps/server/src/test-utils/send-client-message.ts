import type { ContractClient, LogRecord } from '@heynixie/contract';
import type { WaitForConditionOptions } from '@heynixie/testing';
import { waitForCondition } from '@heynixie/testing';

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
  wait: WaitForConditionOptions = {},
): Promise<readonly LogRecord[]> {
  const page: { records: readonly LogRecord[] } = { records: [] };

  const sent = await client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [...(message.spans ?? [])],
    text: message.text,
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const read = await client.conversation.read({ thread: 'conversation' });

    page.records = read.records;

    const reply = page.records.find(
      (record) =>
        record.kind === 'model.reply' &&
        record.sequence > sent.sequence &&
        record.message?.text === replyText,
    );

    // the replies are written as the model writes them, so the turn is done at the step's commit
    return (
      reply !== undefined &&
      page.records.some(
        (record) => record.kind === 'task.step_committed' && record.sequence > reply.sequence,
      )
    );
  }, wait);

  return page.records;
}
