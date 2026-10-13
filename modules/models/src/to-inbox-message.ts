import type { LogRecord } from '@heynixie/log';
import type { InboxMessage } from '@heynixie/wire';
import { encodeInboxUUID } from './encode-inbox-uuid';
import { renderInboxMessage } from './render-inbox-message';
import type { MessageTimeOptions } from './types';

// An inbox record as the guest passes it to the model, with its sequence in the message's uuid.
export function toInboxMessage(record: LogRecord, times: MessageTimeOptions): InboxMessage {
  return { uuid: encodeInboxUUID(record.sequence), text: renderInboxMessage(record, times) };
}
