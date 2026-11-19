import type { ParsedSkill } from '@heynixie/definitions';
import { writeWrittenSkill } from '@heynixie/definitions';
import type { Definitions, Log } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { skillsWriteAppliedCodec } from '../write/skills-write-applied-codec';
import { readCurrentSkillHashes } from './read-current-skill-hashes';

export interface RuleAppliedSkill {
  readonly writeID: string;
  readonly skill: ParsedSkill;
  readonly baseHash: string | null;
  readonly rule: { readonly id: string; readonly revision: number };
  readonly thread: string;
  readonly definitions: Definitions;
  readonly provenance: {
    readonly runID: string;
    readonly callID: string;
    readonly profile: string;
  };
  readonly at: number;
}

// Stores the skill and its record in one transaction, as an approval does. Returns false and writes
// nothing when the version in force moved past the base the caller read, because applying would
// replace a version the model never saw.
export function writeRuleAppliedSkill(log: Log, applied: RuleAppliedSkill): Promise<boolean> {
  return withWriteTransaction(log.writer, async (tx) => {
    const current = await readCurrentSkillHashes(tx);

    if ((current.get(applied.skill.name) ?? null) !== applied.baseHash) {
      return false;
    }

    const approvalID = crypto.randomUUID();

    await writeWrittenSkill(tx, {
      approvalID,
      proposalID: applied.writeID,
      skill: applied.skill,
      approvedAt: applied.at,
    });

    await writeRecordsInTransaction(tx, log, [
      {
        kind: skillsWriteAppliedCodec.kind,
        thread: applied.thread,
        definitions: applied.definitions,
        payload: skillsWriteAppliedCodec.encode({
          writeID: applied.writeID,
          approvalID,
          name: applied.skill.name,
          skillHash: applied.skill.skillHash,
          baseHash: applied.baseHash,
          rule: { id: applied.rule.id, revision: applied.rule.revision },
          provenance: applied.provenance,
        }),
      },
    ]);

    return true;
  });
}
