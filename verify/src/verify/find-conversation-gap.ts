import type { ConversationRecord } from './collect-conversation-records';

export interface ConversationTurn {
  readonly message: string;
  readonly reply: string;
}

// What the records lack for the turn: the owner's message, then the model's reply after it.
export function findConversationGap(
  records: readonly ConversationRecord[],
  turn: ConversationTurn,
): string | null {
  const message = records.find(
    (record) => record.kind === 'owner_message' && record.text === turn.message,
  );

  if (message === undefined) {
    return `an owner_message record with the text "${turn.message}"`;
  }

  const isReplyAfter = records.some(
    (record) =>
      record.kind === 'model.reply' &&
      record.text === turn.reply &&
      record.sequence > message.sequence,
  );

  return isReplyAfter ? null : `a model.reply record "${turn.reply}" after the owner's message`;
}
