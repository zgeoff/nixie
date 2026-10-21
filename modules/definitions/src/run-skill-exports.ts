import type { Log } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildSkillExportChange } from './build-skill-export-change';
import { loadSkillVersions } from './load-skill-versions';
import { manifestPath } from './manifest-path';
import { skillsLockPath } from './skills-lock-path';
import { toSkillExportBranch } from './to-skill-export-branch';
import type {
  DefinitionsRepo,
  DefinitionsTables,
  PullRequestRef,
  WrittenSkillState,
} from './types';
import { writeSkillExportState } from './write-skill-export-state';

export interface SkillExportOptions {
  readonly log: Log;
  readonly repo: DefinitionsRepo;

  // a skill whose export or close fails comes here, and the next run tries it again
  readonly onError: (error: unknown) => void;
}

// the approvals whose skill this run exported, and those whose pull request it closed
export interface SkillExportResult {
  readonly exported: readonly string[];
  readonly closed: readonly string[];
}

// Exports each skill that nixie wrote and that is in force to your definitions repo as a pull
// request, once per approval and again when you keep it over a change to your definitions. It
// closes the pull request of each skill you retired, and of each export a seed's adoption overtook.
export async function runSkillExports(options: SkillExportOptions): Promise<SkillExportResult> {
  const db = options.log.writer.db.$extendTables<DefinitionsTables>();

  const due = await db
    .selectFrom('written_skills as written')
    .leftJoin('skill_exports as export', 'export.approval_id', 'written.approval_id')
    .leftJoin('skill_export_attempts as attempt', 'attempt.approval_id', 'written.approval_id')
    .select([
      'written.approval_id',
      'written.name',
      'written.proposal_id',
      'written.skill_hash',
      'written.base_hash',
      'written.definitions_hash',
      'written.definitions_origin',
    ])
    .where('written.state', '=', 'in_force')
    .where((eb) =>
      eb.or([
        eb('export.approval_id', 'is', null),
        eb('attempt.approval_id', 'is not', null),
        eb('export.base_hash', 'is not', eb.ref('written.base_hash')),
      ]),
    )
    .orderBy('written.name')
    .execute();

  // a seed closes the opened export of an adopted skill, and leaves one in flight to the sweep
  const closing = await db
    .selectFrom('written_skills as written')
    .leftJoin('skill_exports as export', 'export.approval_id', 'written.approval_id')
    .leftJoin('skill_export_attempts as attempt', 'attempt.approval_id', 'written.approval_id')
    .select(['written.approval_id', 'written.name', 'written.state', 'export.pull_request_number'])
    .where('written.state', 'in', ['retired', 'adopted'])
    .where((eb) => {
      const isRetiredOpened = eb.and([
        eb('written.state', '=', 'retired'),
        eb('export.state', '=', 'opened'),
      ]);

      return eb.or([isRetiredOpened, eb('attempt.approval_id', 'is not', null)]);
    })
    .execute();

  const held = await db
    .selectFrom('skill_exports')
    .select(['approval_id', 'pull_request_number'])
    .where('state', '=', 'opened')
    .execute();

  const exported: string[] = [];
  const closed: string[] = [];

  // A later approval of a retired skill exports on the same branch, so the close comes first, and
  // a skill whose close failed waits for the next run.
  const unclosed = new Set<string>();

  for (const row of closing) {
    const heldNumbers = new Set(
      held
        .filter((holding) => holding.approval_id !== row.approval_id)
        .map((holding) => holding.pull_request_number),
    );

    try {
      await closeExport(options, row, heldNumbers);

      closed.push(row.approval_id);
    } catch (error) {
      unclosed.add(row.name);
      options.onError(error);
    }
  }

  for (const row of due.filter((candidate) => !unclosed.has(candidate.name))) {
    try {
      const outcome = await writeSkillExport(options, row);

      (outcome === 'opened' ? exported : closed).push(row.approval_id);
    } catch (error) {
      options.onError(error);
    }
  }

  return { exported, closed };
}

interface ClosingExport {
  readonly approval_id: string;
  readonly name: string;
  readonly state: WrittenSkillState;
  readonly pull_request_number: number | null;
}

// Closes the pull request of a retired export, or of an adopted one that stopped midway. An export
// that stopped before it recorded its pull request finds it by branch, unless another approval's
// export holds that pull request now.
async function closeExport(
  options: SkillExportOptions,
  row: ClosingExport,
  heldNumbers: ReadonlySet<number>,
): Promise<void> {
  const found = await closePullRequest(options, row, heldNumbers);

  await withWriteTransaction(options.log.writer, (tx) =>
    writeSkillExportState(tx, {
      approvalID: row.approval_id,
      to: 'closed',
      pullRequest: found,
      at: options.log.writer.clock.now(),
    }),
  );
}

// Closes the recorded pull request, or the one found by branch, which it returns. The recorded pull
// request of an adopted skill may have merged, so its close looks only for one still open.
async function closePullRequest(
  options: SkillExportOptions,
  row: ClosingExport,
  heldNumbers: ReadonlySet<number>,
): Promise<PullRequestRef | null> {
  if (row.state === 'retired' && row.pull_request_number !== null) {
    await options.repo.closePullRequest(row.pull_request_number);

    return null;
  }

  const found = await options.repo.readOpenPullRequest(toSkillExportBranch(row.name));

  if (found === null || heldNumbers.has(found.number)) {
    return null;
  }

  await options.repo.closePullRequest(found.number);

  return found;
}

interface DueExport {
  readonly approval_id: string;
  readonly name: string;
  readonly proposal_id: string;
  readonly skill_hash: string;
  readonly base_hash: string | null;
  readonly definitions_hash: string | null;
  readonly definitions_origin: string | null;
}

// A seed may adopt the skill while its export writes to the repo, so the export opens only for a
// skill still in force, and otherwise closes the pull request it wrote.
async function writeSkillExport(
  options: SkillExportOptions,
  row: DueExport,
): Promise<'opened' | 'closed'> {
  const hashes =
    row.definitions_hash === null ? [row.skill_hash] : [row.skill_hash, row.definitions_hash];

  const versions = await loadSkillVersions(options.log.writer.db, hashes);

  const version = versions.get(row.skill_hash);

  // the store keeps each version an approval or a seed put in force
  invariant(version);

  const beneath =
    row.definitions_hash === null ? null : (versions.get(row.definitions_hash) ?? null);

  const isBeneathVendored = row.definitions_origin === 'vendored';

  // the export marks itself before it writes to the repo, so a retirement after a lost answer
  // still finds its pull request
  await withWriteTransaction(options.log.writer, (tx) =>
    writeSkillExportState(tx, {
      approvalID: row.approval_id,
      to: 'exporting',
      at: options.log.writer.clock.now(),
    }),
  );

  const revision = await options.repo.readBaseRevision();
  const existing = await options.repo.readFolder(`skills/${version.name}`, revision);

  const change = buildSkillExportChange({
    approvalID: row.approval_id,
    proposalID: row.proposal_id,
    version,
    beneath,
    isBeneathVendored,
    existing,
    lock: isBeneathVendored ? await options.repo.readFile(skillsLockPath, revision) : null,
    manifest: beneath === null ? await options.repo.readFile(manifestPath, revision) : null,
  });

  const pullRequest = await options.repo.writePullRequest(change, revision);

  const isOpened = await withWriteTransaction(options.log.writer, async (tx) => {
    const written = await tx
      .$extendTables<DefinitionsTables>()
      .selectFrom('written_skills')
      .select('state')
      .where('approval_id', '=', row.approval_id)
      .executeTakeFirstOrThrow();

    if (written.state === 'adopted') {
      return false;
    }

    await writeSkillExportState(tx, {
      approvalID: row.approval_id,
      to: 'opened',
      baseHash: row.base_hash,
      pullRequest,
      at: options.log.writer.clock.now(),
    });

    return true;
  });

  if (isOpened) {
    return 'opened';
  }

  await options.repo.closePullRequest(pullRequest.number);

  await withWriteTransaction(options.log.writer, (tx) =>
    writeSkillExportState(tx, {
      approvalID: row.approval_id,
      to: 'closed',
      pullRequest,
      at: options.log.writer.clock.now(),
    }),
  );

  return 'closed';
}
