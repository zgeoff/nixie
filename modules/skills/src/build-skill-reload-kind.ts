import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { EventKind } from '@heynixie/sessions';
import { skillsReloadedCodec } from './skills-reloaded-codec';

// The skills one reload changed, each with how it changed.
export interface SkillReloadEvent {
  readonly changes: readonly SkillReloadChange[];
}

export interface SkillReloadChange {
  readonly name: string;
  readonly change: 'joined' | 'updated' | 'left';
}

// The event kind for a reload on the thread, read from each reload's record. It lists only a
// reload that changed a skill, so the turn after it names the skills whose catalog line changed.
export function buildSkillReloadKind(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  thread: string,
): EventKind<SkillReloadEvent> {
  return {
    name: 'skill_reload',
    read: async (range) => {
      const records = await readRecords(log, {
        afterSequence: range.after,
        beforeSequence: range.through + 1,
        thread,
        kinds: ['skills.reloaded'],
        limit: readLimit,
      });

      return records.flatMap((entry) => {
        const changes = skillsReloadedCodec
          .decode(entry.record.payload)
          .changes.flatMap((skill) => buildChange(skill.name, skill.oldHash, skill.newHash));

        return changes.length === 0
          ? []
          : [
              {
                sequence: entry.record.sequence,
                at: entry.record.recordedAt.getTime(),
                detail: { changes },
              },
            ];
      });
    },
    render: (detail) =>
      `Your skills changed: ${detail.changes.map(formatChange).join('; ')}. The skill catalog ` +
      'lists the versions you run with now; read a skill again to load its new instructions.',
  };
}

// the most reloads one note reads, past which the block's count of more stops growing
const readLimit = 1000;

function buildChange(
  name: string,
  oldHash: string | null,
  newHash: string | null,
): readonly SkillReloadChange[] {
  if (oldHash === newHash) {
    return [];
  }

  if (oldHash === null) {
    return [{ name, change: 'joined' }];
  }

  return [{ name, change: newHash === null ? 'left' : 'updated' }];
}

const changeWords = {
  joined: 'joined your list',
  updated: 'has a new version',
  left: 'left your list',
} satisfies Record<SkillReloadChange['change'], string>;

function formatChange(skill: SkillReloadChange): string {
  return `${skill.name} ${changeWords[skill.change]}`;
}
