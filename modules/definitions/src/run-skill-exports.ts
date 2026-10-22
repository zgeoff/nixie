import type { Log } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { Kysely } from 'kysely';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import { buildSkillExportChange } from './build-skill-export-change';
import { loadSkillVersions } from './load-skill-versions';
import { manifestPath } from './manifest-path';
import { skillsLockPath } from './skills-lock-path';
import { toSkillExportBranch } from './to-skill-export-branch';
import type {
  DefinitionsRepo,
  DefinitionsTables,
  PullRequestRef,
  SkillExportText,
  WrittenSkillState,
} from './types';
import { writeSkillExportState } from './write-skill-export-state';

export interface SkillExportOptions {
  readonly log: Log;
  readonly repo: DefinitionsRepo;
  readonly text?: SkillExportText;

  readonly onError: (error: unknown) => void;
}

export interface SkillExportResult {
  readonly exported: readonly string[];
  readonly closed: readonly string[];
}

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

  const closing = await readClosingExports(options.log.writer.db, null);

  const exported: string[] = [];
  const closed: string[] = [];

  const unclosed = new Set<string>();

  for (const row of closing) {
    try {
      await closeExport(options, row);

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
  readonly attempt_id: string | null;
}

function readClosingExports(
  db: Kysely<unknown>,
  approvalID: string | null,
): Promise<readonly ClosingExport[]> {
  const query = db
    .$extendTables<DefinitionsTables>()
    .selectFrom('written_skills as written')
    .leftJoin('skill_exports as export', 'export.approval_id', 'written.approval_id')
    .leftJoin('skill_export_attempts as attempt', 'attempt.approval_id', 'written.approval_id')
    .select([
      'written.approval_id',
      'written.name',
      'written.state',
      'export.pull_request_number',
      'attempt.approval_id as attempt_id',
    ])
    .where('written.state', '!=', 'in_force')
    .where((eb) =>
      eb.or([eb('export.state', '=', 'opened'), eb('attempt.approval_id', 'is not', null)]),
    );

  return (
    approvalID === null ? query : query.where('written.approval_id', '=', approvalID)
  ).execute();
}

async function closeExport(options: SkillExportOptions, row: ClosingExport): Promise<void> {
  const found = await closePullRequests(options, row);

  await withWriteTransaction(options.log.writer, (tx) =>
    writeSkillExportState(tx, {
      approvalID: row.approval_id,
      to: 'closed',
      pullRequest: found,
      at: options.log.writer.clock.now(),
    }),
  );
}

async function closePullRequests(
  options: SkillExportOptions,
  row: ClosingExport,
): Promise<PullRequestRef | null> {
  const plan = pickPullRequestCloses(row);

  if (plan.recorded !== null) {
    await options.repo.closePullRequest(plan.recorded);
  }

  if (!plan.isBranchRead) {
    return null;
  }

  const found = await options.repo.readOpenPullRequest(toSkillExportBranch(row.name));

  if (found === null || found.number === plan.recorded) {
    return null;
  }

  const isHeld = await probePullRequestHeld(options.log.writer.db, found.number, row.approval_id);

  if (isHeld) {
    return null;
  }

  await options.repo.closePullRequest(found.number);

  return found;
}

// The recorded pull request of an adopted skill may have merged, so only an open one on its branch
// closes, and a superseded approval leaves its branch to the approval after it. An export in flight
// may have written a pull request it never recorded, which the branch finds.
function pickPullRequestCloses(row: ClosingExport): {
  readonly recorded: number | null;
  readonly isBranchRead: boolean;
} {
  const state = row.state;

  invariant(state !== 'in_force');

  return match(state)
    .with('superseded', () => ({ recorded: null, isBranchRead: false }))
    .with('adopted', () => ({ recorded: null, isBranchRead: true }))
    .with('retired', () => ({
      recorded: row.pull_request_number,
      isBranchRead: row.pull_request_number === null || row.attempt_id !== null,
    }))
    .exhaustive();
}

async function probePullRequestHeld(
  db: Kysely<unknown>,
  pullRequestNumber: number,
  approvalID: string,
): Promise<boolean> {
  const holder = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('skill_exports')
    .select('approval_id')
    .where('state', '=', 'opened')
    .where('pull_request_number', '=', pullRequestNumber)
    .where('approval_id', '!=', approvalID)
    .executeTakeFirst();

  return holder !== undefined;
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

// A seed, an approval or a retirement can take the skill out of force while its export runs, so
// the export marks itself and records its pull request only for a skill in force, and otherwise
// closes the export at once.
async function writeSkillExport(
  options: SkillExportOptions,
  row: DueExport,
): Promise<'opened' | 'closed'> {
  const hashes =
    row.definitions_hash === null ? [row.skill_hash] : [row.skill_hash, row.definitions_hash];

  const versions = await loadSkillVersions(options.log.writer.db, hashes);

  const version = versions.get(row.skill_hash);

  invariant(version);

  const beneath =
    row.definitions_hash === null ? null : (versions.get(row.definitions_hash) ?? null);

  const isBeneathVendored = row.definitions_origin === 'vendored';

  // GitHub can apply a write whose answer is lost, so the mark goes first and a later close still
  // looks for the pull request.
  const isMarked = await withWriteTransaction(options.log.writer, async (tx) => {
    if (!(await probeInForce(tx, row.approval_id))) {
      return false;
    }

    await writeSkillExportState(tx, {
      approvalID: row.approval_id,
      to: 'exporting',
      at: options.log.writer.clock.now(),
    });

    return true;
  });

  if (!isMarked) {
    return closeOvertakenExport(options, row.approval_id);
  }

  const revision = await options.repo.readBaseRevision();
  const existing = await options.repo.readFolder(`skills/${version.name}`, revision);

  const change = buildSkillExportChange({
    approvalID: row.approval_id,
    proposalID: row.proposal_id,
    version,
    text: options.text ?? { title: null, message: null, agentName: null, ownerName: null },
    beneath,
    isBeneathVendored,
    existing,
    lock: isBeneathVendored ? await options.repo.readFile(skillsLockPath, revision) : null,
    manifest: beneath === null ? await options.repo.readFile(manifestPath, revision) : null,
  });

  const pullRequest = await options.repo.writePullRequest(change, revision);

  const isOpened = await withWriteTransaction(options.log.writer, async (tx) => {
    if (!(await probeInForce(tx, row.approval_id))) {
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

  return isOpened ? 'opened' : closeOvertakenExport(options, row.approval_id);
}

async function probeInForce(db: Kysely<unknown>, approvalID: string): Promise<boolean> {
  const written = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('written_skills')
    .select('state')
    .where('approval_id', '=', approvalID)
    .executeTakeFirstOrThrow();

  return written.state === 'in_force';
}

async function closeOvertakenExport(
  options: SkillExportOptions,
  approvalID: string,
): Promise<'closed'> {
  const [row] = await readClosingExports(options.log.writer.db, approvalID);

  if (row !== undefined) {
    await closeExport(options, row);
  }

  return 'closed';
}
