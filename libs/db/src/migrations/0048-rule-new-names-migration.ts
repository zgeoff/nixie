import { createHash } from 'node:crypto';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { withTriggersDropped } from '../database/with-triggers-dropped';
import { readQueryRows } from '../read-query-rows';
import type { Migration } from '../types';

const ruleHashColumns = [
  ['rules', 'rule_hash'],
  ['rule_revisions', 'rule_hash'],
  ['definition_rules', 'rule_hash'],
  ['seeded_rules', 'rule_hash'],
  ['runtime_rules', 'rule_hash'],
  ['runtime_rules', 'base_hash'],
  ['runtime_rules', 'definitions_hash'],
  ['snapshot_rules', 'rule_hash'],
  ['proposals', 'rule_hash'],
] as const;

// Each stored rule moves to the new names, which changes its hash, so every row and record that names
// the hash follows. Snapshot hashes stay, because records and copies outside the database name a
// snapshot by hash. No expand step rewrites append-only rows, so the oldest reader rises to this one.
export const ruleNewNamesMigration: Migration = {
  name: 'store rules in the new names definitions and task',
  up: async (tx) => {
    await withTriggersDropped(tx, async () => {
      const ruleHashes = await rewriteRuleVersions(tx);

      for (const [table, column] of ruleHashColumns) {
        await repointColumn(tx, table, column, ruleHashes);
      }

      await removeOldRuleVersions(tx, ruleHashes);

      const proposalHashes = await readProposalHashes(tx, ruleHashes);

      await repointColumn(tx, 'proposals', 'action_hash', proposalHashes);
      await repointColumn(tx, 'closed_rule_proposals', 'proposal_hash', proposalHashes);
      await repointColumn(tx, 'records', 'action_hash', proposalHashes);

      for (const hashes of [ruleHashes, proposalHashes]) {
        await replaceHashText(tx, 'records', 'payload', hashes);
        await replaceHashText(tx, 'projection_changes', 'row', hashes);
      }

      await rewriteDecisions(tx);
      await rewriteSnapshotForms(tx);
    });
  },
};

// A parse with named keys moves them ahead of the others, which would reorder a stored form. Each
// value is parsed as a plain record instead, and only the keys this migration changes are replaced.
const recordSchema = z.record(z.string(), z.unknown());

type HashMap = ReadonlyMap<string, string>;

async function rewriteRuleVersions(tx: Transaction<unknown>): Promise<HashMap> {
  const rows = await readQueryRows(
    sql`select rule_hash, rule from rule_versions
      where rule like ${'%"jobs"%'} or rule like ${'%"job"%'}`,
    tx,
    z.object({ rule_hash: z.string(), rule: z.string() }),
  );

  const hashes = new Map<string, string>();

  for (const row of rows) {
    const form = buildNewNamesForm(recordSchema.safeParse(JSON.parse(row.rule)).data);

    if (form === null) {
      continue;
    }

    const newHash = buildSHA256(toCanonicalJSON(form));

    // Two old rows can map to one new form, and the new form may already exist.
    await sql`insert into rule_versions (rule_hash, rule)
      values (${newHash}, ${JSON.stringify(form)}) on conflict do nothing`.execute(tx);

    hashes.set(row.rule_hash, newHash);
  }

  return hashes;
}

// The form keys in the order the rule store writes them. A key outside the list keeps its place
// after these.
const formKeys = [
  'id',
  'outcome',
  'tools',
  'effects',
  'contexts',
  'definitions',
  'checks',
  'destinations',
  'sources',
  'expires',
  'mandate',
  'cel',
  'note',
];

// The form that the current parser and the rule store give the same rule, or null for a form with no
// old name. `["job"]` with definitions, `["job"]` alone and `["job", "task"]` all become `["task"]`.
function buildNewNamesForm(
  form: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> | null {
  if (form === undefined) {
    return null;
  }

  const contexts = z.array(z.string()).safeParse(form['contexts']);
  const hasOldContext = contexts.success && contexts.data.includes('job');

  if (!('jobs' in form) && !hasOldContext) {
    return null;
  }

  const { jobs, ...rest } = form;
  const renamedContexts = contexts.success ? contexts.data.map((name) => toNewContext(name)) : [];

  const renamed: Record<string, unknown> = {
    ...rest,
    ...(jobs === undefined ? {} : { definitions: rest['definitions'] ?? jobs }),
    ...(contexts.success ? { contexts: [...new Set(renamedContexts)].toSorted() } : {}),
  };

  const listed = formKeys.filter((key) => key in renamed).map((key) => [key, renamed[key]]);
  const others = Object.entries(renamed).filter(([key]) => !formKeys.includes(key));

  return Object.fromEntries([...listed, ...others]);
}

function toNewContext(context: string): string {
  return context === 'job' ? 'task' : context;
}

// A frozen copy of the hex SHA-256 of the definitions module, for the same reason.
function buildSHA256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

// A frozen copy of the canonical JSON that the definitions module wrote when this migration was
// made, so a later change to that module never changes this migration's hashes.
function toCanonicalJSON(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => toCanonicalJSON(item)).join(',')}]`;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .toSorted(([left], [right]) => (left < right ? -1 : 1))
      .map(([key, item]) => `${JSON.stringify(key)}:${toCanonicalJSON(item ?? null)}`);

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

async function repointColumn(
  tx: Transaction<unknown>,
  table: string,
  column: string,
  hashes: HashMap,
): Promise<void> {
  for (const [oldHash, newHash] of hashes) {
    if (table === 'closed_rule_proposals') {
      await sql`insert or ignore into closed_rule_proposals (proposal_hash)
        select ${newHash} where exists (
          select 1 from closed_rule_proposals where proposal_hash = ${oldHash})`.execute(tx);

      await sql`delete from closed_rule_proposals where proposal_hash = ${oldHash}`.execute(tx);
    } else {
      await sql`update ${sql.table(table)} set ${sql.id(column)} = ${newHash}
        where ${sql.id(column)} = ${oldHash}`.execute(tx);
    }
  }
}

async function removeOldRuleVersions(tx: Transaction<unknown>, hashes: HashMap): Promise<void> {
  for (const oldHash of hashes.keys()) {
    await sql`delete from rule_versions where rule_hash = ${oldHash}`.execute(tx);
  }
}

const changeSideSchema = z.object({ hash: z.string() }).nullable();

const changeSchema = z.object({
  ruleID: z.string(),
  before: changeSideSchema,
  after: changeSideSchema,
});

const effectChangeSchema = z.object({ tool: z.string(), remove: z.array(z.string()) });

const proposalPayloadSchema = z.object({
  proposalHash: z.string(),
  changes: z.array(changeSchema),
  effectChanges: z.array(effectChangeSchema).default([]),
});

// A rule proposal's hash covers the hashes of the rules it changes. A payload whose hash this
// recomputation does not reproduce is left as it is.
async function readProposalHashes(tx: Transaction<unknown>, ruleHashes: HashMap): Promise<HashMap> {
  const rows = await readQueryRows(
    sql`select payload from records where kind = 'rules.change_proposed'`,
    tx,
    z.object({ payload: z.string() }),
  );

  const hashes = new Map<string, string>();

  for (const row of rows) {
    const payload = proposalPayloadSchema.safeParse(JSON.parse(row.payload));

    if (!payload.success) {
      continue;
    }

    const oldHash = buildProposalHash(payload.data, new Map());
    const newHash = buildProposalHash(payload.data, ruleHashes);

    if (oldHash === payload.data.proposalHash && newHash !== oldHash) {
      hashes.set(oldHash, newHash);
    }
  }

  return hashes;
}

type ProposalPayload = z.output<typeof proposalPayloadSchema>;

function buildProposalHash(proposal: ProposalPayload, moved: HashMap): string {
  const follow = (side: z.output<typeof changeSideSchema>) =>
    side === null ? null : (moved.get(side.hash) ?? side.hash);

  const rules = proposal.changes.map((change) => ({
    ruleID: change.ruleID,
    before: follow(change.before),
    after: follow(change.after),
  }));

  const effects = proposal.effectChanges.map((held) => ({ tool: held.tool, remove: held.remove }));
  const hashed = effects.length === 0 ? rules : { rules, effects };

  return buildSHA256(toCanonicalJSON(hashed));
}

async function replaceHashText(
  tx: Transaction<unknown>,
  table: string,
  column: string,
  hashes: HashMap,
): Promise<void> {
  for (const [oldHash, newHash] of hashes) {
    await sql`update ${sql.table(table)}
      set ${sql.id(column)} = replace(${sql.id(column)}, ${oldHash}, ${newHash})
      where instr(${sql.id(column)}, ${oldHash}) > 0`.execute(tx);
  }
}

async function rewriteDecisions(tx: Transaction<unknown>): Promise<void> {
  const rows = await readQueryRows(
    sql`select sequence, decision from records where decision like ${'%"job"%'}`,
    tx,
    z.object({ sequence: z.number(), decision: z.string() }),
  );

  for (const row of rows) {
    const decision = recordSchema.safeParse(JSON.parse(row.decision));
    const inputs = recordSchema.safeParse(decision.data?.['inputs']);

    if (!decision.success || !inputs.success || inputs.data['context'] !== 'job') {
      continue;
    }

    const rewritten = { ...decision.data, inputs: { ...inputs.data, context: 'task' } };

    await sql`update records set decision = ${JSON.stringify(rewritten)}
      where sequence = ${row.sequence}`.execute(tx);
  }
}

async function rewriteSnapshotForms(tx: Transaction<unknown>): Promise<void> {
  const rows = await readQueryRows(
    sql`select snapshot_hash, form from definition_snapshots
      where form like ${'%"jobs"%'} or form like ${'%"job"%'}`,
    tx,
    z.object({ snapshot_hash: z.string(), form: z.string() }),
  );

  for (const row of rows) {
    const form = recordSchema.safeParse(JSON.parse(row.form));
    const policy = recordSchema.safeParse(form.data?.['policy']);
    const rules = z.array(recordSchema).safeParse(policy.data?.['rules']);

    if (!form.success || !policy.success || !rules.success) {
      continue;
    }

    const rewrittenRules = rules.data.map((entry) => {
      const stored = recordSchema.safeParse(entry['rule']);
      const nested = buildNewNamesForm(stored.data);

      return nested === null ? (buildNewNamesForm(entry) ?? entry) : { ...entry, rule: nested };
    });

    if (rewrittenRules.every((entry, index) => entry === rules.data[index])) {
      continue;
    }

    // A snapshot form is stored in canonical JSON.
    const text = toCanonicalJSON({
      ...form.data,
      policy: { ...policy.data, rules: rewrittenRules },
    });

    await sql`update definition_snapshots set form = ${text}
      where snapshot_hash = ${row.snapshot_hash}`.execute(tx);
  }
}
