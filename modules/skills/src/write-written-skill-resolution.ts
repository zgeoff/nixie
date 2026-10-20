import { writeWrittenSkillBase, writeWrittenSkillState } from '@heynixie/definitions';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { match } from 'ts-pattern';
import { skillsWrittenResolvedCodec } from './skills-written-resolved-codec';
import type { SkillAnswerContext } from './types';

// Your choice for a skill that nixie wrote, by the approval that applied it: keep nixie's version,
// which makes your definitions' version its base, or keep your definitions' version.
export interface WrittenSkillResolution {
  readonly approvalID: string;
  readonly keep: 'nixie' | 'definitions';
}

// Records your choice for a skill that nixie wrote, in one write transaction with its change, then
// seeds the written skills as they stand. A choice of your definitions retires nixie's version, so
// the seed puts your definitions' version back in force. A skill that left force refuses either.
export async function writeWrittenSkillResolution(
  context: SkillAnswerContext,
  resolution: WrittenSkillResolution,
): Promise<void> {
  const log = context.log;

  await withWriteTransaction(log.writer, async (tx) => {
    const at = context.clock.now();

    const name = await match(resolution.keep)
      .with('definitions', () =>
        writeWrittenSkillState(tx, { approvalID: resolution.approvalID, to: 'retired', at }),
      )
      .with('nixie', () => writeWrittenSkillBase(tx, { approvalID: resolution.approvalID, at }))
      .exhaustive();

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

  await context.seedWrittenSkills();
}
