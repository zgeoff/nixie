import type { LogSeederDeps } from './log-seeder-deps';
import { seedDriftedThread } from './seed-drifted-thread';
import { seedRecord } from './seed-record';
import { seedUnreadableAttachmentRecord } from './seed-unreadable-attachment-record';

export function buildLogSeeder(deps: LogSeederDeps) {
  return {
    record: (input: Parameters<typeof seedRecord>[1]) => seedRecord(deps, input),
    driftedThread: (input: Parameters<typeof seedDriftedThread>[1]) =>
      seedDriftedThread(deps, input),
    unreadableAttachmentRecord: (input: Parameters<typeof seedUnreadableAttachmentRecord>[1]) =>
      seedUnreadableAttachmentRecord(deps, input),
  };
}
