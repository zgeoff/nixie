import type { Log } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Kysely, Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { isDefinitionsPath } from '../definition/is-definitions-path';
import { parseDefinitions } from '../definition/parse-definitions';
import { readDefinitionsInForce } from '../definition/read-definitions-in-force';
import type { TaskSeedContext } from '../task/types';
import type {
  ClosingDefinitionsExport,
  DefinitionsChange,
  DefinitionsChangeKind,
  DefinitionsExportMove,
  DefinitionsExportState,
  DefinitionsRepo,
  DefinitionsTables,
  DueDefinitionsExport,
  Snapshot,
} from '../types';
import { buildSHA256 } from '../utils/build-sha256';
import { canMoveDefinitionsExport } from '../utils/can-move-definitions-export';
import { definitionsFormats } from '../utils/definitions-formats';
import { manifestPath } from '../utils/manifest-path';
import type { RaisedManifest } from '../utils/raise-manifest-format';
import { raiseManifestFormat } from '../utils/raise-manifest-format';
import { toCanonicalJSON } from '../utils/to-canonical-json';
import type { TaskExportChange } from './build-task-export-change';
import { buildTaskExportChange, taskExportBranch } from './build-task-export-change';
import { collectRaiseBlockers } from './collect-raise-blockers';
import { definitionExportMovedCodec } from './definition-export-moved-codec';
import { isExportedDefinition } from './is-exported-definition';
import type { StoredTaskDefinition } from './stored-task-definition';

export interface TaskChangeKindInput {
  readonly log: Log;

  // the context the seed parses task folders with
  readonly tasks: TaskSeedContext;

  // called when the repo already holds the changes, which the next seed adopts
  readonly onHeld: () => void;
}

// Every runtime change of a task definition in force, but a one-shot, goes into one pull request
// on one branch. The ID of an export hashes its changes, so a new change starts the next export,
// which rewrites the same pull request.
export function buildTaskChangeKind(input: TaskChangeKindInput): DefinitionsChangeKind {
  return {
    readDue: (db) => readDueTasks(db, input.tasks, input.onHeld),
    readClosing: readClosingTasks,
    probeInForce: probeTaskExportInForce,
    probePullRequestHeld: probeTaskPullRequestHeld,
    writeState: (tx, move) => writeTaskState(tx, input.log, move),
  };
}

async function readDueTasks(
  db: Kysely<unknown>,
  tasks: TaskSeedContext,
  onHeld: () => void,
): Promise<readonly DueDefinitionsExport[]> {
  const current = await readTaskExport(db);

  if (current === null) {
    return [];
  }

  const row = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('task_definition_exports')
    .select(['state', 'attempt_started_sequence'])
    .where('export_id', '=', current.exportID)
    .executeTakeFirst();

  if (row !== undefined && row.state !== null && row.attempt_started_sequence === null) {
    return [];
  }

  return [
    {
      approvalID: current.exportID,
      branch: taskExportBranch,
      baseHash: null,
      readSource: () =>
        Promise.resolve({
          readChange: (repo, revision) =>
            readTaskChange(repo, revision, current.changes, { tasks, onHeld }),
        }),
    },
  ];
}

interface TaskExport {
  readonly exportID: string;
  readonly changes: readonly TaskExportChange[];
}

async function readTaskExport(db: Kysely<unknown>): Promise<TaskExport | null> {
  const tables = db.$extendTables<DefinitionsTables>();

  const rows = await tables
    .selectFrom('runtime_task_definitions')
    .select(['change_id', 'definition_id', 'operation', 'definition_hash', 'base_hash'])
    .select('definitions_hash')
    .where('state', '=', 'in_force')
    .orderBy('definition_id')
    .execute();

  const versions = await readVersions(
    db,
    rows.flatMap((row) => row.definition_hash ?? []),
  );

  const changes = rows.flatMap((row): TaskExportChange[] => {
    const version =
      row.definition_hash === null ? null : (versions.get(row.definition_hash) ?? null);

    // A change whose version has no row lost its files, and the seed already puts that definition
    // out of force, so exporting it would write nothing a merge could keep.
    if (row.definition_hash !== null && version === null) {
      return [];
    }

    if (!isExportedDefinition(version)) {
      return [];
    }

    return [
      {
        changeID: row.change_id,
        definitionID: row.definition_id,
        operation: row.operation,
        version,
        base: row.base_hash,
        definitions: row.definitions_hash,
      },
    ];
  });

  if (changes.length === 0) {
    return null;
  }

  const left = await tables
    .selectFrom('runtime_task_definitions')
    .select((eb) => eb.fn.countAll<number>().as('leftCount'))
    .where('state', '!=', 'in_force')
    .executeTakeFirstOrThrow();

  const inForce = await readDefinitionsInForce(db);

  // A change that left force, a resolution and a new seed each change the ID, so a set that
  // returns to an earlier state starts a new export in place of the closed one.
  const exportID = buildSHA256(
    toCanonicalJSON({
      branch: taskExportBranch,
      changes: changes.map((change) => ({
        changeID: change.changeID,
        base: change.base,
        definitions: change.definitions,
      })),
      leftCount: left.leftCount,
      snapshotHash: inForce?.snapshotHash ?? null,
    }),
  );

  return { exportID, changes };
}

const storedFormSchema = z.record(z.string(), z.json());
const storedFilesSchema = z.record(z.string(), z.string());

async function readVersions(
  db: Kysely<unknown>,
  hashes: readonly string[],
): Promise<ReadonlyMap<string, StoredTaskDefinition>> {
  if (hashes.length === 0) {
    return new Map();
  }

  const rows = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('task_definition_versions')
    .select(['definition_hash', 'definition_id', 'form', 'files'])
    .where('definition_hash', 'in', hashes)
    .execute();

  return new Map(
    rows.map((row): [string, StoredTaskDefinition] => [
      row.definition_hash,
      {
        definitionID: row.definition_id,
        hash: row.definition_hash,
        form: storedFormSchema.parse(JSON.parse(row.form)),
        files: storedFilesSchema.parse(JSON.parse(row.files)),
      },
    ]),
  );
}

async function readTaskChange(
  repo: DefinitionsRepo,
  revision: string,
  changes: readonly TaskExportChange[],
  hooks: Pick<TaskChangeKindInput, 'tasks' | 'onHeld'>,
): Promise<DefinitionsChange | null> {
  const folderEntries = await Promise.all(
    changes.map(async (change): Promise<[string, readonly string[]]> => {
      const paths = await repo.readFolder(`tasks/${change.definitionID}`, revision);

      return [change.definitionID, paths];
    }),
  );

  const folders = new Map(folderEntries);

  const change = buildTaskExportChange({ changes, folders });

  const sizes = await repo.readFileSizes(revision);

  const textEntries = await Promise.all(
    [...sizes.keys()]
      .filter((path) => isDefinitionsPath(path))
      .map(async (path): Promise<[string, string | null]> => {
        const text = await repo.readFile(path, revision);

        return [path, text];
      }),
  );

  const texts = new Map(textEntries);

  const manifest = texts.get(manifestPath);
  const format = readManifestFormat(manifest);

  // A manifest the seed cannot parse is left to parseDefinitions below, which names its fault.
  if (format !== null && !definitionsFormats.readable.includes(format)) {
    throw new Error(formatUnreadableFormatMessage(format));
  }

  const isChanged = [...change.files].some(([path, text]) => (texts.get(path) ?? null) !== text);

  if (!isChanged) {
    hooks.onHeld();

    return null;
  }

  const raise =
    manifest !== undefined &&
    manifest !== null &&
    format !== null &&
    format < definitionsFormats.tasks
      ? raiseManifestFormat(manifest, definitionsFormats.tasks)
      : null;

  if (raise !== null) {
    requireRaiseApplied({ texts, raise, changes, revision, tasks: hooks.tasks });
  }

  const raised = raise === null ? change : buildRaisedChange(change, raise);

  // The seed refuses the whole snapshot when a task folder has a fault, so a change that leaves
  // one never reaches a pull request.
  const snapshot = new Map(texts);

  for (const [path, text] of raised.files) {
    if (text === null) {
      snapshot.delete(path);
    } else {
      snapshot.set(path, text);
    }
  }

  const changed = buildSnapshot(snapshot, revision);

  parseDefinitions(changed, hooks.tasks);

  return raised;
}

const manifestFormatSchema = z.looseObject({ format: z.number() });

function readManifestFormat(manifest: string | null | undefined): number | null {
  if (manifest === undefined || manifest === null) {
    return null;
  }

  try {
    const parsed = manifestFormatSchema.safeParse(Bun.YAML.parse(manifest));

    return parsed.success ? parsed.data.format : null;
  } catch {
    return null;
  }
}

function formatUnreadableFormatMessage(format: number): string {
  const current = String(definitionsFormats.current);
  const newest = Math.max(...definitionsFormats.readable);

  if (format > newest) {
    return `the definitions repo reads format ${String(format)}, which this release cannot read, so update nixie or set \`format: ${current}\` in nixie.yaml`;
  }

  return `the definitions repo reads format ${String(format)}, which this release cannot read, so set \`format: ${current}\` in nixie.yaml by hand`;
}

interface RaiseCheckInput {
  readonly texts: ReadonlyMap<string, string | null>;
  readonly raise: RaisedManifest;
  readonly changes: readonly TaskExportChange[];
  readonly revision: string;
  readonly tasks: TaskSeedContext;
}

// The repo's own task folders of this export are left out of both parses, because the pull request
// rewrites them.
function requireRaiseApplied(input: RaiseCheckInput): void {
  const ownFolders = input.changes.map((change) => `tasks/${change.definitionID}/`);

  const others = new Map(
    [...input.texts].filter(([path]) => !ownFolders.some((folder) => path.startsWith(folder))),
  );

  const before = parseDefinitions(buildSnapshot(others, input.revision), input.tasks);

  const after = parseDefinitions(
    buildSnapshot(new Map([...others, [manifestPath, input.raise.text]]), input.revision),
    input.tasks,
  );

  const blockers = collectRaiseBlockers(before, after);

  if (blockers.length > 0) {
    throw new Error(formatRaiseBlockedMessage(input.raise.previousFormat, blockers));
  }
}

function buildSnapshot(texts: ReadonlyMap<string, string | null>, revision: string): Snapshot {
  const encoder = new TextEncoder();

  return {
    contentHash: '',
    files: new Map(
      [...texts].flatMap(([path, text]): [string, Uint8Array][] =>
        text === null ? [] : [[path, encoder.encode(text)]],
      ),
    ),
    revision,
    repository: null,
    skipped: [],
  };
}

function formatRaiseBlockedMessage(previousFormat: number, blockers: readonly string[]): string {
  const current = String(definitionsFormats.tasks);
  const them = blockers.length === 1 ? 'it' : 'them';

  return `raising nixie.yaml to format ${current} would apply ${blockers.join(', ')}, which format ${String(previousFormat)} leaves unapplied, so review ${them} and set \`format: ${current}\` in nixie.yaml by hand, or remove ${them}`;
}

function buildRaisedChange(change: DefinitionsChange, raise: RaisedManifest): DefinitionsChange {
  const current = String(definitionsFormats.tasks);
  const note = `nixie.yaml held format ${String(raise.previousFormat)}, and the seed applies task folders only from format ${current}, so the change sets \`format: ${current}\`. The repo holds no other file that the raise starts to apply.`;

  return {
    ...change,
    body: `${change.body}\n\n${note}`,
    files: new Map([...change.files, [manifestPath, raise.text]]),
  };
}

async function readClosingTasks(
  db: Kysely<unknown>,
  exportID: string | null,
): Promise<readonly ClosingDefinitionsExport[]> {
  const current = await readTaskExport(db);

  const query = db
    .$extendTables<DefinitionsTables>()
    .selectFrom('task_definition_exports')
    .select(['export_id', 'branch'])
    .where('export_id', '!=', current?.exportID ?? '')
    .where((eb) =>
      eb.or([eb('state', '=', 'opened'), eb('attempt_started_sequence', 'is not', null)]),
    );

  const rows = await (
    exportID === null ? query : query.where('export_id', '=', exportID)
  ).execute();

  // While a later export holds changes, it rewrites the same pull request, so a close leaves the
  // branch to it. Once none is left, only a pull request still open on the branch closes.
  return rows.map((row) => ({
    approvalID: row.export_id,
    branch: row.branch,
    recordedPullRequest: null,
    isBranchRead: current === null,
  }));
}

async function probeTaskExportInForce(db: Kysely<unknown>, exportID: string): Promise<boolean> {
  const current = await readTaskExport(db);

  return current?.exportID === exportID;
}

async function probeTaskPullRequestHeld(
  db: Kysely<unknown>,
  pullRequestNumber: number,
  exportID: string,
): Promise<boolean> {
  const holder = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('task_definition_exports')
    .select('export_id')
    .where('state', '=', 'opened')
    .where('pull_request_number', '=', pullRequestNumber)
    .where('export_id', '!=', exportID)
    .executeTakeFirst();

  return holder !== undefined;
}

async function writeTaskState(
  tx: Transaction<unknown>,
  log: Log,
  move: DefinitionsExportMove,
): Promise<void> {
  const row = await tx
    .$extendTables<DefinitionsTables>()
    .selectFrom('task_definition_exports')
    .select(['branch', 'state', 'attempt_started_sequence'])
    .where('export_id', '=', move.approvalID)
    .executeTakeFirst();

  const current = pickExportState(row);

  if (current !== null && !canMoveDefinitionsExport(current, move.to)) {
    throw new Error(
      `the task export ${move.approvalID} is ${current}, so it cannot become ${move.to}`,
    );
  }

  const inForce = await readDefinitionsInForce(tx);

  invariant(inForce, 'an export of task definitions needs definitions in force');

  await writeRecordsInTransaction(tx, log, [
    {
      kind: definitionExportMovedCodec.kind,
      definitions: { snapshotHash: inForce.snapshotHash, personaVersion: inForce.personaVersion },
      payload: definitionExportMovedCodec.encode({
        exportID: move.approvalID,
        branch: row?.branch ?? taskExportBranch,
        to: move.to,
        pullRequest: move.to === 'exporting' ? null : move.pullRequest,
      }),
    },
  ]);
}

function pickExportState(
  row:
    | { state: DefinitionsExportState | null; attempt_started_sequence: number | null }
    | undefined,
): DefinitionsExportState | null {
  if (row === undefined) {
    return null;
  }

  return row.attempt_started_sequence === null ? row.state : 'exporting';
}
