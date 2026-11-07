import type { Kysely } from 'kysely';
import { buildRuleExportChange, ruleExportBranch } from './build-rule-export-change';
import { buildSHA256 } from './build-sha256';
import { isDefinitionsPath } from './is-definitions-path';
import { parseDefinitions } from './parse-definitions';
import type { RuleStore } from './read-rule-store';
import { readRuleStore } from './read-rule-store';
import { toCanonicalJSON } from './to-canonical-json';
import type {
  ClosingDefinitionsExport,
  DefinitionsChange,
  DefinitionsChangeKind,
  DefinitionsRepo,
  DefinitionsTables,
  DueDefinitionsExport,
  RuntimeRule,
} from './types';
import { writeRuleExportState } from './write-rule-export-state';

// Every runtime change in force goes into one pull request on one branch. Each export takes its ID
// from the changes it holds, so a new change or a resolution starts the next export, which
// rewrites the same pull request.
export function buildRuleChangeKind(): DefinitionsChangeKind {
  return {
    readDue: readDueRules,
    readClosing: readClosingRules,
    probeInForce: probeRuleExportInForce,
    probePullRequestHeld: probeRulePullRequestHeld,
    writeState: (tx, move) => writeRuleExportState(tx, move),
  };
}

async function readDueRules(db: Kysely<unknown>): Promise<readonly DueDefinitionsExport[]> {
  const current = await readRuleExport(db);

  if (current === null) {
    return [];
  }

  const row = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('rule_exports')
    .select(['state', 'attempt_started_at'])
    .where('export_id', '=', current.exportID)
    .executeTakeFirst();

  if (row !== undefined && row.state !== null && row.attempt_started_at === null) {
    return [];
  }

  return [
    {
      approvalID: current.exportID,
      branch: ruleExportBranch,
      baseHash: null,
      readSource: () =>
        Promise.resolve({
          readChange: (repo, revision) => readRuleChange(repo, revision, current.changes),
        }),
    },
  ];
}

interface RuleExport {
  readonly exportID: string;
  readonly changes: readonly RuntimeRule[];
}

async function readRuleExport(db: Kysely<unknown>): Promise<RuleExport | null> {
  const store = await readRuleStore(db);

  const left = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('runtime_rules')
    .select((eb) => eb.fn.countAll<number>().as('leftCount'))
    .where('state', '!=', 'in_force')
    .executeTakeFirstOrThrow();

  return buildRuleExport(store, left.leftCount);
}

// A mandate lasts a day at most, so it never reaches the user's definitions. The ID also counts the
// changes that left force, so a set that returns to an earlier one starts a new export in place of
// the closed one.
function buildRuleExport(store: RuleStore, leftCount: number): RuleExport | null {
  const changes = store.runtime.filter((change) => change.rule?.rule.mandate === undefined);

  if (changes.length === 0) {
    return null;
  }

  const paths = new Map(
    store.definitions.map((definition) => [definition.rule.id, definition.path]),
  );

  const exportID = buildSHA256(
    toCanonicalJSON({
      changes: changes.map((change) => ({
        changeID: change.changeID,
        base: change.base?.hash ?? null,
        beneath: change.beneath?.hash ?? null,
        path: paths.get(change.ruleID) ?? null,
      })),
      leftCount,
    }),
  );

  return { exportID, changes };
}

async function readRuleChange(
  repo: DefinitionsRepo,
  revision: string,
  changes: readonly RuntimeRule[],
): Promise<DefinitionsChange> {
  const sizes = await repo.readFileSizes(revision);

  const paths = [...sizes.keys()].filter((path) => isDefinitionsPath(path));

  const read = await Promise.all(
    paths.map(async (path): Promise<[string, string]> => {
      const text = await repo.readFile(path, revision);

      return [path, text ?? ''];
    }),
  );

  const texts = new Map(read);
  const ruleFiles = new Map([...texts].filter(([path]) => /^rules\/.+\.ya?ml$/u.test(path)));

  const change = buildRuleExportChange({ changes, files: ruleFiles });

  // The seed refuses the whole snapshot when one file fails to parse, so a change that leaves the
  // definitions unparsable, or in a format that applies no rule file, never reaches a pull request.
  const encoder = new TextEncoder();
  const edited = new Map([...texts, ...change.files]);

  const parsed = parseDefinitions({
    contentHash: '',
    files: new Map(
      [...edited].flatMap(([path, text]): [string, Uint8Array][] =>
        text === null ? [] : [[path, encoder.encode(text)]],
      ),
    ),
    revision,
    repository: null,
    skipped: [],
  });

  if (parsed.formatVersion < 3) {
    throw new Error(
      `the definitions repo reads format ${String(parsed.formatVersion)}, which applies no rule file`,
    );
  }

  return change;
}

async function readClosingRules(
  db: Kysely<unknown>,
  exportID: string | null,
): Promise<readonly ClosingDefinitionsExport[]> {
  const current = await readRuleExport(db);

  const query = db
    .$extendTables<DefinitionsTables>()
    .selectFrom('rule_exports')
    .select('export_id')
    .where('export_id', '!=', current?.exportID ?? '')
    .where((eb) => eb.or([eb('state', '=', 'opened'), eb('attempt_started_at', 'is not', null)]));

  const rows = await (
    exportID === null ? query : query.where('export_id', '=', exportID)
  ).execute();

  // While a later export holds runtime changes, it rewrites the same pull request, so a close
  // leaves the branch to it. Once no change is left, the user merged them or dropped them, so only
  // a pull request still open on the branch closes.
  return rows.map((row) => ({
    approvalID: row.export_id,
    branch: ruleExportBranch,
    recordedPullRequest: null,
    isBranchRead: current === null,
  }));
}

async function probeRuleExportInForce(db: Kysely<unknown>, exportID: string): Promise<boolean> {
  const current = await readRuleExport(db);

  return current?.exportID === exportID;
}

async function probeRulePullRequestHeld(
  db: Kysely<unknown>,
  pullRequestNumber: number,
  exportID: string,
): Promise<boolean> {
  const holder = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('rule_exports')
    .select('export_id')
    .where('state', '=', 'opened')
    .where('pull_request_number', '=', pullRequestNumber)
    .where('export_id', '!=', exportID)
    .executeTakeFirst();

  return holder !== undefined;
}
