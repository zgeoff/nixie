import type { LiveTopic } from '@heynixie/log';
import type { APIRecordKind } from './api-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const apiRecordTopics = {
  'session.enrolled': [],
  'session.labelled': [],
  'session.revoked': [],
  session_kept: [],
  'enrolment_code.issued': [],
  'identity.refused': [],
  'passkey.registered': [],
  'passkey.revoked': [],
  'passkey.used': [],
  'passkey_code.issued': [],
} as const satisfies Record<APIRecordKind, readonly LiveTopic[]>;
