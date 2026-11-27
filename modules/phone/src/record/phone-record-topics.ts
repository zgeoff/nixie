import type { LiveTopic } from '@heynixie/log';
import type { PhoneRecordKind } from './phone-record-kind';

// The topics each record kind changes, which the server registers with the log while the phone is on.
// No page shows the assistant's texts.
export const phoneRecordTopics = {
  'phone.text_received': [],
  'phone.send_claimed': [],
} as const satisfies Record<PhoneRecordKind, readonly LiveTopic[]>;
