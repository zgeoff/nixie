import type { Log } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';

// Records your messages on the conversation thread, oldest first, the way a past conversation left
// them, and returns their sequences.
export async function writeOwnerMessages(
  log: Log,
  texts: readonly string[],
): Promise<readonly number[]> {
  const records = await writeRecords(
    log,
    texts.map((text) => ({
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text },
    })),
  );

  return records.map((record) => record.sequence);
}
