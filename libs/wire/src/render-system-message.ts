import { mintBlockID } from './mint-block-id';

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

  readonly at: string;
  readonly body: string;
}

// The random ID only stops the body from closing the element early. It does not authenticate the
// element: the system prompt's position rule tells the model which elements come from nixie.
export function renderSystemMessage(message: SystemMessage): string {
  const blockID = mintBlockID();

  return [
    `<system-message type="${message.type}" id="${blockID}" at="${message.at}">`,
    message.body,
    `</system-message id="${blockID}">`,
  ].join('\n');
}
