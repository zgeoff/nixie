import type { Log, LogRecord } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { PromptOverrides } from '@heynixie/prompts';
import { buildDefinitionsSnapshot } from './build-definitions-snapshot';
import { buildSkillOverlay } from './build-skill-overlay';
import { parseDefinitions } from './parse-definitions';
import { readDefinitionsInForce } from './read-definitions-in-force';
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

    const built = buildDefinitionsSnapshot({
      persona: read.parsed.persona,
      policy: options.buildPolicy(read.parsed.prompts),
      prompts: read.parsed.prompts,
      skills: overlay.skills,
      conversationSkills: overlay.conversationSkills,
    });

    await writeAdoptedSkills(tx, {
      adopted: overlay.adopted,
      skills: read.parsed.skills,
      at: options.log.writer.clock.now(),
    });

    if (
      inForce !== null &&
      overlay.adopted.length === 0 &&
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
      unapplied: read.parsed.unapplied,
      skipped: read.snapshot.skipped,
      versions: read.parsed.skills,
      overlay,
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
