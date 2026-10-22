import type { Kysely } from 'kysely';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import type { SkillExport } from './build-skill-export-change';
import { buildSkillExportChange } from './build-skill-export-change';
import { loadSkillVersions } from './load-skill-versions';
import { manifestPath } from './manifest-path';
import { skillsLockPath } from './skills-lock-path';
import { toSkillExportBranch } from './to-skill-export-branch';
import type {
  ClosingDefinitionsExport,
  DefinitionsChange,
  DefinitionsChangeKind,
  DefinitionsExportSource,
  DefinitionsRepo,
  DefinitionsSkillOrigin,
  DefinitionsTables,
  DueDefinitionsExport,
  SkillExportText,
  WrittenSkillState,
} from './types';
import { writeSkillExportState } from './write-skill-export-state';

export function buildSkillChangeKind(text: SkillExportText): DefinitionsChangeKind {
  return {
    readDue: (db) => readDueSkills(db, text),
    readClosing: readClosingSkills,
    probeInForce: probeSkillInForce,
    probePullRequestHeld: probeSkillPullRequestHeld,
    writeState: writeSkillExportState,
  };
}

async function readDueSkills(
  db: Kysely<unknown>,
  text: SkillExportText,
): Promise<readonly DueDefinitionsExport[]> {
  const due = await db
    .$extendTables<DefinitionsTables>()
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

  return due.map((row) => ({
    approvalID: row.approval_id,
    branch: toSkillExportBranch(row.name),
    baseHash: row.base_hash,
    readSource: (database) => readSkillSource(database, row, text),
  }));
}

interface DueSkillRow {
  readonly approval_id: string;
  readonly proposal_id: string;
  readonly skill_hash: string;
  readonly definitions_hash: string | null;
  readonly definitions_origin: DefinitionsSkillOrigin | null;
}

type SkillExportInput = Omit<SkillExport, 'existing' | 'lock' | 'manifest'>;

async function readSkillSource(
  db: Kysely<unknown>,
  row: DueSkillRow,
  text: SkillExportText,
): Promise<DefinitionsExportSource> {
  const hashes =
    row.definitions_hash === null ? [row.skill_hash] : [row.skill_hash, row.definitions_hash];

  const versions = await loadSkillVersions(db, hashes);

  const version = versions.get(row.skill_hash);

  invariant(version);

  const skillExport: SkillExportInput = {
    approvalID: row.approval_id,
    proposalID: row.proposal_id,
    version,
    text,
    beneath: row.definitions_hash === null ? null : (versions.get(row.definitions_hash) ?? null),
    isBeneathVendored: row.definitions_origin === 'vendored',
  };

  return { readChange: (repo, revision) => readSkillChange(repo, revision, skillExport) };
}

async function readSkillChange(
  repo: DefinitionsRepo,
  revision: string,
  skillExport: SkillExportInput,
): Promise<DefinitionsChange> {
  const existing = await repo.readFolder(`skills/${skillExport.version.name}`, revision);

  return buildSkillExportChange({
    ...skillExport,
    existing,
    lock: skillExport.isBeneathVendored ? await repo.readFile(skillsLockPath, revision) : null,
    manifest: skillExport.beneath === null ? await repo.readFile(manifestPath, revision) : null,
  });
}

async function readClosingSkills(
  db: Kysely<unknown>,
  approvalID: string | null,
): Promise<readonly ClosingDefinitionsExport[]> {
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

  const rows = await (
    approvalID === null ? query : query.where('written.approval_id', '=', approvalID)
  ).execute();

  return rows.map((row) => buildClosingSkill(row));
}

interface ClosingSkillRow {
  readonly approval_id: string;
  readonly name: string;
  readonly state: WrittenSkillState;
  readonly pull_request_number: number | null;
  readonly attempt_id: string | null;
}

// The recorded pull request of an adopted skill may have merged, so only an open one on its branch
// closes, and a superseded approval leaves its branch to the approval after it. An export in flight
// may have written a pull request it never recorded, which the branch finds.
function buildClosingSkill(row: ClosingSkillRow): ClosingDefinitionsExport {
  const state = row.state;

  invariant(state !== 'in_force');

  const approvalID = row.approval_id;
  const branch = toSkillExportBranch(row.name);

  return match(state)
    .with('superseded', () => ({
      approvalID,
      branch,
      recordedPullRequest: null,
      isBranchRead: false,
    }))
    .with('adopted', () => ({ approvalID, branch, recordedPullRequest: null, isBranchRead: true }))
    .with('retired', () => ({
      approvalID,
      branch,
      recordedPullRequest: row.pull_request_number,
      isBranchRead: row.pull_request_number === null || row.attempt_id !== null,
    }))
    .exhaustive();
}

async function probeSkillInForce(db: Kysely<unknown>, approvalID: string): Promise<boolean> {
  const written = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('written_skills')
    .select('state')
    .where('approval_id', '=', approvalID)
    .executeTakeFirstOrThrow();

  return written.state === 'in_force';
}

async function probeSkillPullRequestHeld(
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
