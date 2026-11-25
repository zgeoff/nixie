import type { Log } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import { effectNames, mcpOverridesFormSchema } from '@heynixie/policy';
import type { PromptOverrides } from '@heynixie/prompts';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import { buildDefinitionsSnapshot } from '../definition/build-definitions-snapshot';
import { readDefinitionsInForce } from '../definition/read-definitions-in-force';
import { readDefinitionsSkills } from '../definition/read-definitions-skills';
import { readPendingRuleProposals } from '../rule/read-pending-rule-proposals';
import type { SeedResult } from '../rule/run-seed';
import { buildTaskSeedRecords } from '../runtime-task/build-task-seed-records';
import { readTaskSeedInput } from '../runtime-task/read-task-seed-input';
import { writeAdoptedSkills } from '../skill/write-adopted-skills';
import type { TaskHooksContext } from '../task/write-task-hooks';
import { writeTaskHooks } from '../task/write-task-hooks';
import type { SnapshotPolicy } from '../types';
import type { BudgetBase } from '../utils/build-budget-seed-plan';
import { buildBudgetSeedPlan } from '../utils/build-budget-seed-plan';
import { buildRuleRevisions } from '../utils/build-rule-revisions';
import { buildRuleSeedPlan } from '../utils/build-rule-seed-plan';
import { buildSkillOverlay } from '../utils/build-skill-overlay';
import { buildTaskSeedPlan } from '../utils/build-task-seed-plan';
import { readBudgetsInForce } from '../utils/read-budgets-in-force';
import { readRuleStore } from '../utils/read-rule-store';
import { readWrittenSkills } from '../written/read-written-skills';
import { readRepoBudgets } from './read-repo-budgets';
import { readRepoTasks } from './read-repo-tasks';
import { readSeedPolicy } from './read-seed-policy';
import { writeSeed } from './write-seed';

export interface InForceSeedOptions {
  readonly log: Log;
  readonly buildPolicy: (prompts: PromptOverrides) => SnapshotPolicy;
  readonly builtInBudgets?: readonly BudgetBase[];

  // the triggers that another module owns, which the seed arms beside the definitions
  readonly readExtraArmed?: TaskHooksContext['readExtraArmed'];
}

export function runInForceSeed(options: InForceSeedOptions): Promise<SeedResult> {
  return withWriteTransaction(options.log.writer, (tx) => seedInForceInTransaction(tx, options));
}

// The caller owns the transaction, so a runtime change and its seed commit or roll back together.
// oxlint-disable-next-line zgeoff/function-verb -- the design names the in-force seed this way
export async function seedInForceInTransaction(
  tx: Transaction<unknown>,
  options: InForceSeedOptions,
): Promise<SeedResult> {
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

  const repoBudgets = await readRepoBudgets(tx, inForce);

  const budgets = buildBudgetSeedPlan({
    definitions: repoBudgets,
    inForce: await readBudgetsInForce(tx),
    builtIn: options.builtInBudgets ?? [],
  });

  const revisions = buildRuleRevisions(store.current, rules.inForce);
  const now = options.log.writer.clock.now();

  const lists = await readSeedLists(tx, inForce.recordSequence);

  const policy = await readSeedPolicy(tx, {
    base: options.buildPolicy(inForce.prompts),
    overrides: lists.effects,
    rules: revisions.inForce,
  });

  if (policy.status === 'refused') {
    return { status: 'refused', error: policy.error, inForce };
  }

  const pending = await readPendingRuleProposals(tx, now);
  const repoTasks = await readRepoTasks(tx, inForce);
  const taskInput = await readTaskSeedInput(tx, repoTasks);

  const taskPlan = buildTaskSeedPlan(taskInput);

  const built = buildDefinitionsSnapshot({
    persona: inForce.persona,
    policy: policy.policy,
    prompts: inForce.prompts,
    skills: overlay.skills,
    conversationSkills: overlay.conversationSkills,
    tasks: taskPlan.tasks,
    budgets: budgets.inForce,
    mcp: lists.mcp,
  });

  await writeAdoptedSkills(tx, {
    adopted: overlay.adopted,
    skills: definitions.skills,
    at: now,
  });

  await writeTaskHooks(
    tx,
    {
      log: options.log,
      definitions: () => ({ snapshotHash: built.snapshotHash }),
      ...(options.readExtraArmed === undefined ? {} : { readExtraArmed: options.readExtraArmed }),
    },
    built.tasks,
  );

  if (
    overlay.adopted.length === 0 &&
    rules.adopted.length === 0 &&
    budgets.applied.length === 0 &&
    pending.length === 0 &&
    taskPlan.adopted.length === 0 &&
    taskPlan.moved.length === 0 &&
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
    mcp: lists.mcp,
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
    budgets: { plan: budgets, repo: repoBudgets },
    withdrawnProposalIDs: pending.map((entry) => entry.proposal.proposalID),
    built,
    repoTasks,
    taskRecords: buildTaskSeedRecords(taskPlan, {
      snapshotHash: built.snapshotHash,
      personaVersion: built.personaVersion,
    }),
    previous: inForce,
  });

  return { status: 'seeded', ...written };
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
  mcp: mcpOverridesFormSchema.default({}),
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
