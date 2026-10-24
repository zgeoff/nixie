import type { Log } from '@heynixie/log';
import type { PromptsTables } from '@heynixie/prompts';
import { promptIDs, readPromptApproval, writePromptExportRecord } from '@heynixie/prompts';
import type { Kysely, Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import type { PromptExportText } from './build-prompt-export-change';
import { buildPromptExportChange } from './build-prompt-export-change';
import { manifestPath } from './manifest-path';
import { readDefinitionsInForce } from './read-definitions-in-force';
import { toPromptExportBranch } from './to-prompt-export-branch';
import type {
  ClosingDefinitionsExport,
  DefinitionsChange,
  DefinitionsChangeKind,
  DefinitionsExportMove,
  DefinitionsRepo,
  DefinitionsTables,
  DueDefinitionsExport,
} from './types';
import { writePromptExportState } from './write-prompt-export-state';

export function buildPromptChangeKind(log: Log, text: PromptExportText): DefinitionsChangeKind {
  return {
    readDue: (db) => readDuePrompts(db, text),
    readClosing: readClosingPrompts,
    probeInForce: probePromptInForce,
    probePullRequestHeld: probePromptPullRequestHeld,
    writeState: (tx, move) => writePromptState(tx, log, move),
  };
}

const promptIDSchema = z.enum(promptIDs);

async function readDuePrompts(
  db: Kysely<unknown>,
  text: PromptExportText,
): Promise<readonly DueDefinitionsExport[]> {
  const due = await db
    .$extendTables<PromptsTables & DefinitionsTables>()
    .selectFrom('prompt_approvals as approval')
    .leftJoin('prompt_exports as export', 'export.approval_id', 'approval.approval_id')
    .leftJoin('prompt_export_attempts as attempt', 'attempt.approval_id', 'approval.approval_id')
    .select(['approval.approval_id', 'approval.prompt_id'])
    .where('approval.state', '=', 'current')
    .where((eb) =>
      eb.or([eb('export.approval_id', 'is', null), eb('attempt.approval_id', 'is not', null)]),
    )
    .orderBy('approval.prompt_id')
    .execute();

  return due.map((row) => ({
    approvalID: row.approval_id,
    branch: toPromptExportBranch(promptIDSchema.parse(row.prompt_id)),
    baseHash: null,
    readSource: async (database) => {
      const approval = await readPromptApproval(database, row.approval_id);

      return {
        readChange: (repo, revision) => readPromptChange(repo, revision, { ...approval, text }),
      };
    },
  }));
}

type PromptChangeInput = Omit<Parameters<typeof buildPromptExportChange>[0], 'manifest' | 'sizes'>;

async function readPromptChange(
  repo: DefinitionsRepo,
  revision: string,
  input: PromptChangeInput,
): Promise<DefinitionsChange> {
  const manifest = await repo.readFile(manifestPath, revision);

  if (manifest === null) {
    throw new Error(`the definitions repo holds no ${manifestPath} to add the prompt override to`);
  }

  const sizes = await repo.readFileSizes(revision);

  return buildPromptExportChange({ ...input, manifest, sizes });
}

async function readClosingPrompts(
  db: Kysely<unknown>,
  approvalID: string | null,
): Promise<readonly ClosingDefinitionsExport[]> {
  const query = db
    .$extendTables<PromptsTables & DefinitionsTables>()
    .selectFrom('prompt_approvals as approval')
    .leftJoin('prompt_exports as export', 'export.approval_id', 'approval.approval_id')
    .leftJoin('prompt_export_attempts as attempt', 'attempt.approval_id', 'approval.approval_id')
    .select(['approval.approval_id', 'approval.prompt_id'])
    .where('approval.state', '=', 'superseded')
    .where((eb) =>
      eb.or([eb('export.state', '=', 'opened'), eb('attempt.approval_id', 'is not', null)]),
    );

  const rows = await (
    approvalID === null ? query : query.where('approval.approval_id', '=', approvalID)
  ).execute();

  // The approval that superseded this one writes its pull request on the same branch, so the
  // close leaves the branch and its open pull request to it.
  return rows.map((row) => ({
    approvalID: row.approval_id,
    branch: toPromptExportBranch(promptIDSchema.parse(row.prompt_id)),
    recordedPullRequest: null,
    isBranchRead: false,
  }));
}

async function probePromptInForce(db: Kysely<unknown>, approvalID: string): Promise<boolean> {
  const approval = await db
    .$extendTables<PromptsTables>()
    .selectFrom('prompt_approvals')
    .select('state')
    .where('approval_id', '=', approvalID)
    .executeTakeFirstOrThrow();

  return approval.state === 'current';
}

async function probePromptPullRequestHeld(
  db: Kysely<unknown>,
  pullRequestNumber: number,
  approvalID: string,
): Promise<boolean> {
  const holder = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('prompt_exports')
    .select('approval_id')
    .where('state', '=', 'opened')
    .where('pull_request_number', '=', pullRequestNumber)
    .where('approval_id', '!=', approvalID)
    .executeTakeFirst();

  return holder !== undefined;
}

async function writePromptState(
  tx: Transaction<unknown>,
  log: Log,
  move: DefinitionsExportMove,
): Promise<void> {
  const recorded = await tx
    .$extendTables<DefinitionsTables>()
    .selectFrom('prompt_exports')
    .select('pull_request_url')
    .where('approval_id', '=', move.approvalID)
    .where('state', '=', 'opened')
    .executeTakeFirst();

  await writePromptExportState(tx, move);

  // A retry after a lost answer finds the pull request it already opened, and the model has read
  // that one.
  if (move.to !== 'opened' || recorded?.pull_request_url === move.pullRequest.url) {
    return;
  }

  const inForce = await readDefinitionsInForce(tx);

  invariant(inForce, 'a prompt proposal needs definitions in force, so its export has them');

  await writePromptExportRecord(tx, log, {
    approvalID: move.approvalID,
    pullRequestURL: move.pullRequest.url,
    definitions: { snapshotHash: inForce.snapshotHash, personaVersion: inForce.personaVersion },
  });
}
