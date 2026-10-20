import { writeWrittenSkillBase, writeWrittenSkillState } from '@heynixie/definitions';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { skillsWrittenResolvedCodec } from './skills-written-resolved-codec';
import type { SkillAnswerContext } from './types';

// Your choice for a skill that nixie wrote, by the approval that applied it: keep nixie's version,
// which makes your definitions' version its base, or keep your definitions' version.
export interface WrittenSkillResolution {
  readonly approvalID: string;
  readonly keep: 'nixie' | 'definitions';
}

// Records your choice for a skill that nixie wrote, in one write transaction with its change. A
// choice of your definitions retires nixie's version, and a seed of the definitions in force then
// puts your definitions' version back in force. A skill that left force refuses either choice.
export async function writeWrittenSkillResolution(
  context: SkillAnswerContext,
  resolution: WrittenSkillResolution,
): Promise<void> {
  const log = context.log;

  await withWriteTransaction(log.writer, async (tx) => {
    const at = context.clock.now();

    const name =
      resolution.keep === 'definitions'
        ? await writeWrittenSkillState(tx, { approvalID: resolution.approvalID, to: 'retired', at })
        : await writeWrittenSkillBase(tx, { approvalID: resolution.approvalID, at });

    await writeRecordsInTransaction(tx, log, [
      {
        kind: 'skills.written_resolved',
        definitions: context.definitions(),
        payload: skillsWrittenResolvedCodec.encode({
          approvalID: resolution.approvalID,
          name,
          keep: resolution.keep,
        }),
      },
    ]);
  });

  if (resolution.keep === 'definitions') {
    await context.seedWrittenSkills();
  }
}
