import type { Log, LogRecord } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { PromptOverrides } from '@heynixie/prompts';
import { buildDefinitionRule } from './build-definition-rule';
import { buildDefinitionsSnapshot } from './build-definitions-snapshot';
import { buildRuleRevisions } from './build-rule-revisions';
import { buildRuleSeedPlan } from './build-rule-seed-plan';
import { buildSkillOverlay } from './build-skill-overlay';
import { parseDefinitions } from './parse-definitions';
import { readDefinitionsInForce } from './read-definitions-in-force';
import { readRuleProposalChange } from './read-rule-proposal-change';
import { readRuleStore } from './read-rule-store';
import { readSeedPolicy } from './read-seed-policy';
import { readWrittenSkills } from './read-written-skills';
import type {
  DefinitionsInForce,
  DefinitionsSnapshot,
  DefinitionsSource,
  ParsedDefinitions,
  Snapshot,
  SnapshotPolicy,
} from './types';
import { writeAdoptedSkills } from './write-adopted-skills';
import { writeSeed } from './write-seed';

export interface SeedOptions {
  readonly log: Log;
  readonly source: DefinitionsSource;

  readonly buildPolicy: (prompts: PromptOverrides) => SnapshotPolicy;
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
  const read = await tryReadDefinitions(options.source);

  if (read instanceof Error) {
    const inForce = await readDefinitionsInForce(options.log.writer.db);

    return { status: 'refused', error: read, inForce };
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

    const revisions = buildRuleRevisions(store.current, rules.inForce);
    const now = options.log.writer.clock.now();

    const policy = await readSeedPolicy(tx, {
      base: options.buildPolicy(read.parsed.prompts),
      overrides: read.parsed.effects,
      inForce,
      rules: revisions.inForce,
    });

    if (policy.status === 'refused') {
      return { status: 'refused', error: policy.error, inForce };
    }

    const proposals = await readRuleProposalChange(tx, rules.held, policy.held, now);

    const built = buildDefinitionsSnapshot({
      persona: read.parsed.persona,
      policy: policy.policy,
      prompts: read.parsed.prompts,
      skills: overlay.skills,
      conversationSkills: overlay.conversationSkills,
    });

    await writeAdoptedSkills(tx, {
      adopted: overlay.adopted,
      skills: read.parsed.skills,
      at: now,
    });

    if (
      inForce !== null &&
      overlay.adopted.length === 0 &&
      rules.adopted.length === 0 &&
      proposals.withdrawn === null &&
      proposals.proposed === null &&
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
      heldEffects: policy.held,
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
      proposals,
      built,
      previous: inForce,
    });

    return { status: 'seeded', ...written };
  });
}

interface ReadDefinitions {
  readonly snapshot: Snapshot;
  readonly parsed: ParsedDefinitions;
}

async function tryReadDefinitions(source: DefinitionsSource): Promise<ReadDefinitions | Error> {
  try {
    const snapshot = await source.snapshot();

    return { snapshot, parsed: parseDefinitions(snapshot) };
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
