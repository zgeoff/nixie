import type { EnvelopeRecord } from '@heynixie/log';
import { taskMessageCodec } from './task-message-codec';

// A brief record is the one task_message at hop 0: a message that a task sends takes the sender's
// hop plus 1.
export function isBriefRecord(record: Pick<EnvelopeRecord, 'kind' | 'payload'>): boolean {
  return record.kind === 'task_message' && taskMessageCodec.decode(record.payload).hop === 0;
}
