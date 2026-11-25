import type { LiveTopic } from '@heynixie/log';
import type { CredentialRecordKind } from './credential-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const credentialRecordTopics = {
  'credential.refresh_started': [],
  'credential.refresh_saved': [],
  'credential.refresh_failed': [],
  'credential.refresh_discarded': [],
  'credential.refresh_lost': [],
  'credential.status_changed': [],
} as const satisfies Record<CredentialRecordKind, readonly LiveTopic[]>;
