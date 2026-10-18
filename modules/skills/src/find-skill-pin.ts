import type { SkillRef } from '@heynixie/definitions';
import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { skillsPinnedCodec } from './skills-pinned-codec';

// The skill versions a task runs with, from the newest pin on its thread, in name order, or null
// before the task's first pin.
export async function findSkillPin(log: Log, thread: string): Promise<readonly SkillRef[] | null> {
  const [newest] = await readRecords(log, {
    afterSequence: 0,
    thread,
    kinds: ['skills.pinned'],
    order: 'newest',
    limit: 1,
  });

  if (newest === undefined) {
    return null;
  }

  return skillsPinnedCodec.decode(newest.record.payload).skills;
}
