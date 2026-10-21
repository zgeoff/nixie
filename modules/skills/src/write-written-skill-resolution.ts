import { writeWrittenSkillBase, writeWrittenSkillState } from '@heynixie/definitions';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { match } from 'ts-pattern';
import { skillsWrittenResolvedCodec } from './skills-written-resolved-codec';
import type { SkillAnswerContext } from './types';

export interface WrittenSkillResolution {
  readonly approvalID: string;
  readonly keep: 'nixie' | 'definitions';
}

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
