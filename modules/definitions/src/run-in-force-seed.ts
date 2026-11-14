import type { Log } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import { effectNames } from '@heynixie/policy';
import type { PromptOverrides } from '@heynixie/prompts';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import { buildDefinitionsSnapshot } from './build-definitions-snapshot';
import { buildRuleRevisions } from './build-rule-revisions';
import { buildRuleSeedPlan } from './build-rule-seed-plan';
import { buildSkillOverlay } from './build-skill-overlay';
import { readDefinitionsInForce } from './read-definitions-in-force';
import { readDefinitionsSkills } from './read-definitions-skills';
import { readRuleProposalChange } from './read-rule-proposal-change';
import { readRuleStore } from './read-rule-store';
import { readSeedPolicy } from './read-seed-policy';
import { readWrittenSkills } from './read-written-skills';
import type { SeedResult } from './run-seed';
import type { SnapshotPolicy } from './types';
import { writeAdoptedSkills } from './write-adopted-skills';
import { writeSeed } from './write-seed';

export interface InForceSeedOptions {
  readonly log: Log;
  readonly buildPolicy: (prompts: PromptOverrides) => SnapshotPolicy;
}

export function runInForceSeed(options: InForceSeedOptions): Promise<SeedResult> {
  return withWriteTransaction(options.log.writer, async (tx) => {
    const inForce = await readDefinitionsInForce(tx);

    if (inForce === null) {
      return { status: 'refused', error: new Error('no definitions are in force yet'), inForce };
    }

    const definitions = await readDefinitionsSkills(tx, inForce.snapshotHash);

    const overlay = buildSkillOverlay({
      skills: definitions.skills,
      conversationSkills: definitions.conversationSkills,
      written: await readWrittenSkills(tx),
    });

    const store = await readRuleStore(tx);

    const rules = buildRuleSeedPlan({
      definitions: store.definitions,
      seeded: store.seeded,
      runtime: store.runtime,
    });

    const revisions = buildRuleRevisions(store.current, rules.inForce);
    const now = options.log.writer.clock.now();

    const lists = await readSeedLists(tx, inForce.recordSequence);

    const policy = await readSeedPolicy(tx, {
      base: options.buildPolicy(inForce.prompts),
      overrides: lists.effects,
      inForce,
      rules: revisions.inForce,
    });

    if (policy.status === 'refused') {
      return { status: 'refused', error: policy.error, inForce };
    }

    const proposals = await readRuleProposalChange(tx, rules.held, policy.held, now);

    const built = buildDefinitionsSnapshot({
      persona: inForce.persona,
      policy: policy.policy,
      prompts: inForce.prompts,
      skills: overlay.skills,
      conversationSkills: overlay.conversationSkills,
    });

    await writeAdoptedSkills(tx, {
      adopted: overlay.adopted,
      skills: definitions.skills,
      at: now,
    });

    if (
      overlay.adopted.length === 0 &&
      rules.adopted.length === 0 &&
      proposals.withdrawn === null &&
      proposals.proposed === null &&
      built.snapshotHash === inForce.snapshotHash
    ) {
      return { status: 'unchanged', inForce };
    }

    const written = await writeSeed(tx, options.log, {
      source: {
        id: inForce.sourceID,
        kind: inForce.sourceKind,
        repository: inForce.sourceRepository,
        revision: inForce.revision,
        contentHash: inForce.contentHash,
      },
      formatVersion: inForce.formatVersion,
      effects: lists.effects,
      heldEffects: policy.held,
      unapplied: lists.unapplied,
      skipped: lists.skipped,
      versions: [],
      overlay,
      rules: {
        plan: rules,
        definitions: null,
        revisions,
        at: now,
      },
      proposals,
      built,
      previous: inForce,
    });

    return { status: 'seeded', ...written };
  });
}

const effectNameSchema = z.enum(effectNames);

const overrideSchema = z.object({
  add: effectNameSchema.array(),
  remove: effectNameSchema.array(),
});

const seedLists = z.object({
  unapplied: z.array(z.string()).default([]),
  skipped: z.array(z.string()).default([]),
  effects: z
    .record(z.string(), overrideSchema)
    .default({})
    .transform((overrides) => new Map(Object.entries(overrides))),
});

type SeedRecordTables = Readonly<{
  records: { readonly sequence: number; readonly payload: string };
}>;

async function readSeedLists(
  tx: Transaction<unknown>,
  sequence: number,
): Promise<z.infer<typeof seedLists>> {
  const record = await tx
    .$extendTables<SeedRecordTables>()
    .selectFrom('records')
    .select('payload')
    .where('sequence', '=', sequence)
    .executeTakeFirstOrThrow();

  return seedLists.parse(JSON.parse(record.payload));
}
