import type { Log, LogRecord } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { RuleFileWarning } from '@heynixie/policy';
import { buildPlacesSeedPlan, buildPlacesSeedRecords, readSeedPlaceRows } from '@heynixie/policy';
import type { PromptOverrides } from '@heynixie/prompts';
import { buildDefinitionRule } from '../definition/build-definition-rule';
import { buildDefinitionsSnapshot } from '../definition/build-definitions-snapshot';
import { parseDefinitions } from '../definition/parse-definitions';
import { readDefinitionsInForce } from '../definition/read-definitions-in-force';
import { buildTaskSeedRecords } from '../runtime-task/build-task-seed-records';
import { readTaskSeedInput } from '../runtime-task/read-task-seed-input';
import type { SelfPlacesReader } from '../seed/read-seed-policy';
import { readSeedPolicy } from '../seed/read-seed-policy';
import { writeSeed } from '../seed/write-seed';
import { writeAdoptedSkills } from '../skill/write-adopted-skills';
import type { TaskDefinitionWarning, TaskSeedContext } from '../task/types';
import type { TaskHooksContext } from '../task/write-task-hooks';
import { writeTaskHooks } from '../task/write-task-hooks';
import { writeTaskVersions } from '../task/write-task-versions';
import type {
  DefinitionsInForce,
  DefinitionsSnapshot,
  DefinitionsSource,
  ParsedDefinitions,
  SectionFileProblem,
  Snapshot,
  SnapshotPolicy,
} from '../types';
import { buildBudgetSeedPlan } from '../utils/build-budget-seed-plan';
import type { BudgetBase } from '../utils/build-budget-seed-plan';
import { buildRuleRevisions } from '../utils/build-rule-revisions';
import { buildRuleSeedPlan } from '../utils/build-rule-seed-plan';
import { buildSkillOverlay } from '../utils/build-skill-overlay';
import { buildTaskSeedPlan } from '../utils/build-task-seed-plan';
import { readBudgetsInForce } from '../utils/read-budgets-in-force';
import { readRuleStore } from '../utils/read-rule-store';
import { readWrittenSkills } from '../written/read-written-skills';
import { readPendingRuleProposals } from './read-pending-rule-proposals';

export interface SeedOptions {
  readonly log: Log;

  // Takes each rule field this release does not know
  readonly onRuleWarning?: (warning: RuleFileWarning) => void;

  // Takes each retired prompt key that the manifest held and the seed dropped
  readonly onRetiredPromptKey?: (key: string) => void;
  readonly source: DefinitionsSource;

  // The check of a task definition, and the names of the tools it may list
  readonly tasks: TaskSeedContext;

  // Takes each skipped definition and each dropped tool
  readonly onTaskWarning?: (warning: TaskDefinitionWarning) => void;

  // Takes each file of a feature's section that the seed left unapplied, which never refuses the seed
  readonly onSectionProblem?: (problem: SectionFileProblem) => void;

  readonly buildPolicy: (prompts: PromptOverrides) => SnapshotPolicy;

  // The built-in budget of each paid tool, which a budget of the definitions may change
  readonly builtInBudgets?: readonly BudgetBase[];

  // the triggers that another module owns, which the seed arms beside the definitions
  readonly readExtraArmed?: TaskHooksContext['readExtraArmed'];

  // the accounts that are you, which the snapshot lists as places at self
  readonly readSelfPlaces?: SelfPlacesReader;
}

export type SeedResult =
  | {
      readonly status: 'seeded';
      readonly inForce: DefinitionsInForce;
      readonly record: LogRecord;
    }
  | { readonly status: 'unchanged'; readonly inForce: DefinitionsInForce }
  | {
      readonly status: 'refused';
      readonly error: Error;
      readonly inForce: DefinitionsInForce | null;
    };

// The caller must run one seed at a time, or an older revision can commit after a newer one.
export async function runSeed(options: SeedOptions): Promise<SeedResult> {
  const read = await tryReadDefinitions(options.source, options.tasks);

  if (read instanceof Error) {
    const inForce = await readDefinitionsInForce(options.log.writer.db);

    return { status: 'refused', error: read, inForce };
  }

  for (const warning of read.parsed.ruleWarnings) {
    options.onRuleWarning?.(warning);
  }

  for (const key of read.parsed.retiredPromptKeys) {
    options.onRetiredPromptKey?.(key);
  }

  for (const warning of read.parsed.taskWarnings) {
    options.onTaskWarning?.(warning);
  }

  for (const problem of read.parsed.sectionProblems) {
    options.onSectionProblem?.(problem);
  }

  return withWriteTransaction(options.log.writer, async (tx) => {
    const inForce = await readDefinitionsInForce(tx);

    const overlay = buildSkillOverlay({
      skills: read.parsed.skills,
      conversationSkills: read.parsed.conversationSkills,
      written: await readWrittenSkills(tx),
    });

    const store = await readRuleStore(tx);

    const definitions = read.parsed.rules.map((entry) => buildDefinitionRule(entry));

    const rules = buildRuleSeedPlan({
      definitions,
      seeded: store.seeded,
      runtime: store.runtime,
    });

    const budgets = buildBudgetSeedPlan({
      definitions: read.parsed.budgets,
      inForce: await readBudgetsInForce(tx),
      builtIn: options.builtInBudgets ?? [],
    });

    const revisions = buildRuleRevisions(store.current, rules.inForce);
    const now = options.log.writer.clock.now();

    const placeRows = await readSeedPlaceRows(tx);

    const placesPlan = buildPlacesSeedPlan(read.parsed.places, placeRows);

    const selfPlaces = await options.readSelfPlaces?.(tx);

    const policy = await readSeedPolicy(tx, {
      base: options.buildPolicy(read.parsed.prompts),
      overrides: read.parsed.effects,
      rules: revisions.inForce,
      places: placesPlan,
      selfPlaces: selfPlaces ?? [],
    });

    if (policy.status === 'refused') {
      return { status: 'refused', error: policy.error, inForce };
    }

    const pending = await readPendingRuleProposals(tx, now);

    await writeTaskVersions(tx, read.parsed.tasks);

    const repoTasks = read.parsed.tasks.map((task) => ({ id: task.id, hash: task.hash }));

    const taskInput = await readTaskSeedInput(tx, repoTasks);

    const taskPlan = buildTaskSeedPlan(taskInput);

    const built = buildDefinitionsSnapshot({
      persona: read.parsed.persona,
      policy: policy.policy,
      prompts: read.parsed.prompts,
      skills: overlay.skills,
      conversationSkills: overlay.conversationSkills,
      tasks: taskPlan.tasks,
      budgets: budgets.inForce,
      mcp: read.parsed.mcp,
      sections: read.parsed.sections,
    });

    await writeAdoptedSkills(tx, {
      adopted: overlay.adopted,
      skills: read.parsed.skills,
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
      inForce !== null &&
      overlay.adopted.length === 0 &&
      rules.adopted.length === 0 &&
      budgets.applied.length === 0 &&
      pending.length === 0 &&
      taskPlan.adopted.length === 0 &&
      taskPlan.moved.length === 0 &&
      isSameSeed(inForce, { ...read, built, sourceID: options.source.id })
    ) {
      return { status: 'unchanged', inForce };
    }

    const written = await writeSeed(tx, options.log, {
      source: {
        id: options.source.id,
        kind: options.source.kind,
        repository: read.snapshot.repository,
        revision: read.snapshot.revision,
        contentHash: read.snapshot.contentHash,
      },
      formatVersion: read.parsed.formatVersion,
      effects: read.parsed.effects,
      mcp: read.parsed.mcp,
      unapplied: read.parsed.unapplied,
      skipped: read.snapshot.skipped,
      versions: read.parsed.skills,
      overlay,
      rules: {
        plan: rules,
        definitions,
        revisions,
        at: now,
      },
      budgets: { plan: budgets, repo: read.parsed.budgets },
      withdrawnProposalIDs: pending.map((entry) => entry.proposal.proposalID),
      built,
      repoTasks,
      placeRecords: buildPlacesSeedRecords(placesPlan, { snapshotHash: built.snapshotHash }),
      taskRecords: buildTaskSeedRecords(taskPlan, {
        snapshotHash: built.snapshotHash,
        personaVersion: built.personaVersion,
      }),
      previous: inForce,
    });

    return { status: 'seeded', ...written };
  });
}

interface ReadDefinitions {
  readonly snapshot: Snapshot;
  readonly parsed: ParsedDefinitions;
}

async function tryReadDefinitions(
  source: DefinitionsSource,
  tasks: TaskSeedContext,
): Promise<ReadDefinitions | Error> {
  try {
    const snapshot = await source.snapshot();

    return { snapshot, parsed: parseDefinitions(snapshot, tasks) };
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

function isSameSeed(
  inForce: DefinitionsInForce,
  plan: ReadDefinitions & { readonly built: DefinitionsSnapshot; readonly sourceID: string },
): boolean {
  return (
    inForce.sourceID === plan.sourceID &&
    inForce.sourceRepository === plan.snapshot.repository &&
    inForce.revision === plan.snapshot.revision &&
    inForce.contentHash === plan.snapshot.contentHash &&
    inForce.snapshotHash === plan.built.snapshotHash
  );
}
