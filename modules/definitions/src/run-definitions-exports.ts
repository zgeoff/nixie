import type { Log } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type {
  ClosingDefinitionsExport,
  DefinitionsChangeKind,
  DefinitionsRepo,
  DueDefinitionsExport,
  PullRequestRef,
} from './types';

export interface DefinitionsExportOptions {
  readonly log: Log;
  readonly repo: DefinitionsRepo;
  readonly kinds: readonly DefinitionsChangeKind[];

  readonly onError: (error: unknown) => void;
}

export interface DefinitionsExportResult {
  readonly exported: readonly string[];
  readonly closed: readonly string[];
}

export async function runDefinitionsExports(
  options: DefinitionsExportOptions,
): Promise<DefinitionsExportResult> {
  const exported: string[] = [];
  const closed: string[] = [];

  for (const kind of options.kinds) {
    const result = await runKindExports(options, kind);

    exported.push(...result.exported);
    closed.push(...result.closed);
  }

  return { exported, closed };
}

async function runKindExports(
  options: DefinitionsExportOptions,
  kind: DefinitionsChangeKind,
): Promise<DefinitionsExportResult> {
  const db = options.log.writer.db;

  const due = await kind.readDue(db);
  const closing = await kind.readClosing(db, null);

  const exported: string[] = [];
  const closed: string[] = [];

  const unclosed = new Set<string>();

  for (const row of closing) {
    try {
      await closeExport(options, kind, row);

      closed.push(row.approvalID);
    } catch (error) {
      unclosed.add(row.branch);
      options.onError(error);
    }
  }

  for (const row of due.filter((candidate) => !unclosed.has(candidate.branch))) {
    try {
      const outcome = await writeExport(options, kind, row);

      (outcome === 'opened' ? exported : closed).push(row.approvalID);
    } catch (error) {
      options.onError(error);
    }
  }

  return { exported, closed };
}

async function closeExport(
  options: DefinitionsExportOptions,
  kind: DefinitionsChangeKind,
  row: ClosingDefinitionsExport,
): Promise<void> {
  const found = await closePullRequests(options, kind, row);

  await withWriteTransaction(options.log.writer, (tx) =>
    kind.writeState(tx, {
      approvalID: row.approvalID,
      to: 'closed',
      pullRequest: found,
      at: options.log.writer.clock.now(),
    }),
  );
}

async function closePullRequests(
  options: DefinitionsExportOptions,
  kind: DefinitionsChangeKind,
  row: ClosingDefinitionsExport,
): Promise<PullRequestRef | null> {
  if (row.recordedPullRequest !== null) {
    await options.repo.closePullRequest(row.recordedPullRequest);
  }

  if (!row.isBranchRead) {
    return null;
  }

  const found = await options.repo.readOpenPullRequest(row.branch);

  if (found === null || found.number === row.recordedPullRequest) {
    return null;
  }

  const isHeld = await kind.probePullRequestHeld(
    options.log.writer.db,
    found.number,
    row.approvalID,
  );

  if (isHeld) {
    return null;
  }

  await options.repo.closePullRequest(found.number);

  return found;
}

// A seed, an approval or a retirement can take the change out of force while its export runs, so
// the export marks itself and records its pull request only for a change in force, and otherwise
// closes the export at once.
async function writeExport(
  options: DefinitionsExportOptions,
  kind: DefinitionsChangeKind,
  row: DueDefinitionsExport,
): Promise<'opened' | 'closed'> {
  // GitHub can apply a write whose answer is lost, so the mark goes first and a later close still
  // looks for the pull request.
  const isMarked = await withWriteTransaction(options.log.writer, async (tx) => {
    if (!(await kind.probeInForce(tx, row.approvalID))) {
      return false;
    }

    await kind.writeState(tx, {
      approvalID: row.approvalID,
      to: 'exporting',
      at: options.log.writer.clock.now(),
    });

    return true;
  });

  if (!isMarked) {
    return closeOvertakenExport(options, kind, row.approvalID);
  }

  const revision = await options.repo.readBaseRevision();
  const change = await row.readChange(options.repo, revision);
  const pullRequest = await options.repo.writePullRequest(change, revision);

  const isOpened = await withWriteTransaction(options.log.writer, async (tx) => {
    if (!(await kind.probeInForce(tx, row.approvalID))) {
      return false;
    }

    await kind.writeState(tx, {
      approvalID: row.approvalID,
      to: 'opened',
      baseHash: row.baseHash,
      pullRequest,
      at: options.log.writer.clock.now(),
    });

    return true;
  });

  return isOpened ? 'opened' : closeOvertakenExport(options, kind, row.approvalID);
}

async function closeOvertakenExport(
  options: DefinitionsExportOptions,
  kind: DefinitionsChangeKind,
  approvalID: string,
): Promise<'closed'> {
  const [row] = await kind.readClosing(options.log.writer.db, approvalID);

  if (row !== undefined) {
    await closeExport(options, kind, row);
  }

  return 'closed';
}
