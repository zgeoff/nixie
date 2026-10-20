import { mintBlockID } from './mint-block-id';

// The kinds of block nixie writes into a user message.
export type SystemMessageType =
  | 'pinned-memory'
  | 'status'
  | 'summary'
  | 'compaction'
  | 'recent-turns'
  | 'events'
  | 'retrieved-memory'
  | 'retrieved-self-notes'
  | 'retrieved-messages'
  | 'pinned-memory-changes'
  | 'timer'
  | 'outcome';

export interface SystemMessage {
  readonly type: SystemMessageType;

  // when the message was written, as a message stamp shows a time, such as Tue 14 Oct, 22:50, Sydney
  readonly at: string;
  readonly body: string;
}

// Renders a block nixie writes into a user message as a system-message element. A fresh random ID
// on both tags keeps a closing tag in the body from ending it early; the system prompt's position
// rule, not the ID, tells the model which elements come from nixie.
export function renderSystemMessage(message: SystemMessage): string {
  const blockID = mintBlockID();

  return [
    `<system-message type="${message.type}" id="${blockID}" at="${message.at}">`,
    message.body,
    `</system-message id="${blockID}">`,
  ].join('\n');
}
