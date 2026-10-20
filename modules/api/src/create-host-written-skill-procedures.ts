import type { WrittenSkillEntry } from '@heynixie/definitions';
import { readSkillExportURLs, readWrittenSkills } from '@heynixie/definitions';
import type { SkillAnswerContext } from '@heynixie/skills';
import { writeWrittenSkillResolution } from '@heynixie/skills';
import { hostImplementer } from './host-implementer';

// Builds the host procedures over the skills that nixie wrote and that are in force: list them,
// each marked when your definitions changed it after the approval and with its export's pull
// request, and keep one side of a skill.
export function createHostWrittenSkillProcedures(context: SkillAnswerContext) {
  const written = hostImplementer.skills.written;

  return {
    list: written.list.handler(async () => {
      const skills = await readWrittenSkills(context.log.writer.db);
      const urls = await readSkillExportURLs(context.log.writer.db);

      return skills.map((skill) => buildWrittenEntry(skill, urls.get(skill.approvalID) ?? null));
    }),

    resolve: written.resolve.handler(async (options) => {
      await writeWrittenSkillResolution(context, options.input);

      return { approvalID: options.input.approvalID, keep: options.input.keep };
    }),
  };
}

function buildWrittenEntry(skill: WrittenSkillEntry, pullRequestURL: string | null) {
  return {
    approvalID: skill.approvalID,
    proposalID: skill.proposalID,
    name: skill.name,
    skillHash: skill.skillHash,
    base:
      skill.base === null ? null : { skillHash: skill.base.skillHash, origin: skill.base.origin },
    definitions:
      skill.definitions === null
        ? null
        : { skillHash: skill.definitions.skillHash, origin: skill.definitions.origin },
    isConflict: (skill.definitions?.skillHash ?? null) !== (skill.base?.skillHash ?? null),
    pullRequestURL,
    approvedAt: new Date(skill.approvedAt),
  };
}
