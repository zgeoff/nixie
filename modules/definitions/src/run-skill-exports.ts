import type { Log } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildSkillExportChange } from './build-skill-export-change';
import { loadSkillVersions } from './load-skill-versions';
import { manifestPath } from './manifest-path';
import { skillsLockPath } from './skills-lock-path';
import { toSkillExportBranch } from './to-skill-export-branch';
import type { DefinitionsRepo, DefinitionsTables } from './types';
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
// closes the pull request of each skill you retired by keeping your definitions' version.
export async function runSkillExports(options: SkillExportOptions): Promise<SkillExportResult> {
  const db = options.log.writer.db.$extendTables<DefinitionsTables>();

  const due = await db
    .selectFrom('written_skills as written')
    .leftJoin('skill_exports as export', 'export.approval_id', 'written.approval_id')
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
        eb('export.state', '=', 'exporting'),
        eb('export.base_hash', 'is not', eb.ref('written.base_hash')),
      ]),
    )
    .orderBy('written.name')
    .execute();

  const retired = await db
    .selectFrom('written_skills as written')
    .innerJoin('skill_exports as export', 'export.approval_id', 'written.approval_id')
    .select(['written.approval_id', 'written.name', 'export.pull_request_number'])
    .where('written.state', '=', 'retired')
    .where('export.state', 'in', ['exporting', 'opened'])
    .execute();

  const held = await db
    .selectFrom('skill_exports')
    .select('pull_request_number')
    .where('state', '=', 'opened')
    .execute();

  const exported: string[] = [];
  const closed: string[] = [];

  // A later approval of a retired skill exports on the same branch, so the close comes first, and
  // a skill whose close failed waits for the next run.
  const unclosed = new Set<string>();
  const heldNumbers = new Set(held.map((row) => row.pull_request_number));

  for (const row of retired) {
    try {
      await closeRetiredExport(options, row, heldNumbers);

      closed.push(row.approval_id);
    } catch (error) {
      unclosed.add(row.name);
      options.onError(error);
    }
  }

  for (const row of due.filter((candidate) => !unclosed.has(candidate.name))) {
    try {
      await writeSkillExport(options, row);

      exported.push(row.approval_id);
    } catch (error) {
      options.onError(error);
    }
  }

  return { exported, closed };
}

interface RetiredExport {
  readonly approval_id: string;
  readonly name: string;
  readonly pull_request_number: number | null;
}

// Closes the pull request of a retired export. An export that stopped before it recorded its pull
// request finds it by branch, unless another approval's export holds that pull request now.
async function closeRetiredExport(
  options: SkillExportOptions,
  row: RetiredExport,
  heldNumbers: ReadonlySet<number | null>,
): Promise<void> {
  if (row.pull_request_number === null) {
    const found = await options.repo.readOpenPullRequest(toSkillExportBranch(row.name));

    if (found !== null && !heldNumbers.has(found.number)) {
      await options.repo.closePullRequest(found.number);
    }
  } else {
    await options.repo.closePullRequest(row.pull_request_number);
  }

  await withWriteTransaction(options.log.writer, (tx) =>
    writeSkillExportState(tx, {
      approvalID: row.approval_id,
      to: 'closed',
      at: options.log.writer.clock.now(),
    }),
  );
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

async function writeSkillExport(options: SkillExportOptions, row: DueExport): Promise<void> {
  const hashes =
    row.definitions_hash === null ? [row.skill_hash] : [row.skill_hash, row.definitions_hash];

  const versions = await loadSkillVersions(options.log.writer.db, hashes);

  const version = versions.get(row.skill_hash);

  // the store keeps each version an approval or a seed put in force
  invariant(version);

  const beneath =
    row.definitions_hash === null ? null : (versions.get(row.definitions_hash) ?? null);

  const isBeneathVendored = row.definitions_origin === 'vendored';

  // the export records itself before it writes to the repo, so a retirement after a lost answer
  // still finds its pull request
  await withWriteTransaction(options.log.writer, (tx) =>
    writeSkillExportState(tx, {
      approvalID: row.approval_id,
      to: 'exporting',
      baseHash: row.base_hash,
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

  await withWriteTransaction(options.log.writer, (tx) =>
    writeSkillExportState(tx, {
      approvalID: row.approval_id,
      to: 'opened',
      baseHash: row.base_hash,
      pullRequest,
      at: options.log.writer.clock.now(),
    }),
  );
}
