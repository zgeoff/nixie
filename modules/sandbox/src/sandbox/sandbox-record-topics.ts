import type { LiveTopic } from '@heynixie/log';
import type { SandboxRecordKind } from './sandbox-record-kind';

// The topics each record kind changes, which the server registers with the log.
export const sandboxRecordTopics = {
  'sandbox.created': [],
  'sandbox.granted': [],
  'sandbox.slept': [],
  'sandbox.woken': [],
  'sandbox.destroyed': [],
} as const satisfies Record<SandboxRecordKind, readonly LiveTopic[]>;
