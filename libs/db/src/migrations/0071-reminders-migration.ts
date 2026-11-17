import { createHash } from 'node:crypto';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { withTriggersDropped } from '../database/with-triggers-dropped';
import { readQueryRows } from '../read-query-rows';
import type { Migration } from '../types';

// A conversation definition becomes a reminder and every other definition loses its target key, so
// each changed hash is followed by what names it. Snapshot hashes stay, because records outside the
// database name them. No expand step rewrites append-only rows, so the oldest reader rises.
export const remindersMigration: Migration = {
  name: 'replace the conversation-target definitions with reminders',
  up: async (tx) => {
    await createTables(tx);

    await withTriggersDropped(tx, async () => {
      const versions = await readVersions(tx);

      const reminders = versions.filter((version) => version.form['target'] === 'conversation');

      const tasks = versions.filter(
        (version) => 'target' in version.form && !reminders.includes(version),
      );

      await writeReminderVersions(tx, reminders);
      await writeMoves(tx);

      const hashes = await rewriteTaskVersions(tx, tasks);

      const removed = new Set(reminders.map((version) => version.hash));

      await removeVersions(
        tx,
        reminders.map((version) => version.hash),
      );

      await repointColumns(tx, hashes);
      await rewriteRecords(tx, hashes, removed);
      await rewriteProjectionChanges(tx, hashes);
      await rewriteSnapshotForms(tx, hashes, removed);
    });
  },
};

async function createTables(tx: Transaction<unknown>): Promise<void> {
  await sql`create table if not exists reminders (
    reminder_id text primary key,
    short_id text not null,
    reminder_hash text not null,
    trigger text not null,
    state text not null,
    origin text not null,
    set_sequence integer not null,
    fired_at integer,
    recent_fires text not null,
    updated_sequence integer not null
  ) strict`.execute(tx);

  await sql`create unique index if not exists reminders_by_short_id
    on reminders (short_id)`.execute(tx);

  await sql`create index if not exists reminders_by_state on reminders (state)`.execute(tx);

  await sql`create table if not exists reminder_versions (
    reminder_hash text primary key,
    name text not null,
    note text not null,
    trigger text not null
  ) strict`.execute(tx);

  await sql`create table if not exists reminder_moves (
    definition_id text primary key,
    name text not null,
    note text not null,
    trigger text not null,
    source text not null,
    change_id text
  ) strict`.execute(tx);
}

type Form = Readonly<Record<string, unknown>>;

interface Version {
  readonly hash: string;
  readonly id: string;
  readonly form: Form;
  readonly files: Readonly<Record<string, string>>;
}

const recordSchema = z.record(z.string(), z.unknown());
const filesSchema = z.record(z.string(), z.string());

// A parse with named keys moves them ahead of the others, which would reorder a stored form, so each
// value is parsed as a plain record.
async function readVersions(tx: Transaction<unknown>): Promise<readonly Version[]> {
  const rows = await readQueryRows(
    sql`select definition_hash, definition_id, form, files from task_definition_versions
      order by definition_hash`,
    tx,
    z.object({
      definition_hash: z.string(),
      definition_id: z.string(),
      form: z.string(),
      files: z.string(),
    }),
  );

  return rows.flatMap((row) => {
    const form = recordSchema.safeParse(JSON.parse(row.form));
    const files = filesSchema.safeParse(JSON.parse(row.files));

    return form.success && files.success
      ? [{ hash: row.definition_hash, id: row.definition_id, form: form.data, files: files.data }]
      : [];
  });
}

async function writeReminderVersions(
  tx: Transaction<unknown>,
  reminders: readonly Version[],
): Promise<void> {
  for (const version of reminders) {
    const name = version.form['name'];
    const note = version.form['brief'];
    const trigger = version.form['trigger'];

    // A conversation definition with no trigger never armed, so no fire names its hash.
    if (typeof name !== 'string' || typeof note !== 'string' || !isPresent(trigger)) {
      continue;
    }

    await sql`insert or ignore into reminder_versions (reminder_hash, name, note, trigger)
      values (${version.hash}, ${name}, ${note}, ${toCanonicalJSON(trigger)})`.execute(tx);
  }
}

function isPresent(value: unknown): boolean {
  return value !== null && value !== undefined;
}

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

// The armed definitions with a conversation target move to reminders at the next start, because a
// migration writes no record and a projection row with no record behind it is lost at a rebuild.
async function writeMoves(tx: Transaction<unknown>): Promise<void> {
  const armed = await readQueryRows(
    sql`select definition_id, definition_hash from trigger_definitions
      where target = 'conversation' and definition_hash is not null`,
    tx,
    z.object({ definition_id: z.string(), definition_hash: z.string() }),
  );

  for (const row of armed) {
    const versions = await readQueryRows(
      sql`select name, note, trigger from reminder_versions where reminder_hash = ${row.definition_hash}`,
      tx,
      z.object({ name: z.string(), note: z.string(), trigger: z.string() }),
    );

    const [version] = versions;

    if (version === undefined) {
      continue;
    }

    const changes = await readQueryRows(
      sql`select change_id from runtime_task_definitions
        where definition_id = ${row.definition_id} and state = 'in_force'`,
      tx,
      z.object({ change_id: z.string() }),
    );

    const changeID = changes[0]?.change_id ?? null;

    await sql`insert or ignore into reminder_moves
      (definition_id, name, note, trigger, source, change_id)
      values (${row.definition_id}, ${version.name}, ${version.note}, ${version.trigger},
        ${changeID === null ? 'repo' : 'runtime'}, ${changeID})`.execute(tx);
  }
}

type HashMap = ReadonlyMap<string, string>;

// Drops the target from the form, and from a task.yaml that a chat built, which the migration
// before this one stored as rendered block YAML. A task.yaml from a repo keeps its text, and the
// seed refuses it until its line goes.
async function rewriteTaskVersions(
  tx: Transaction<unknown>,
  tasks: readonly Version[],
): Promise<HashMap> {
  const hashes = new Map<string, string>();

  for (const version of tasks) {
    const { target: _target, ...form } = version.form;
    const files = dropTargetFromFiles(version);
    const hash = buildDefinitionHash({ ...version, form, files });

    await sql`insert or ignore into task_definition_versions
      (definition_hash, definition_id, form, files)
      values (${hash}, ${version.id}, ${toCanonicalJSON(form)}, ${toCanonicalJSON(files)})`.execute(
      tx,
    );

    await sql`delete from task_definition_versions where definition_hash = ${version.hash}`.execute(
      tx,
    );

    hashes.set(version.hash, hash);
  }

  return hashes;
}

function dropTargetFromFiles(version: Version): Record<string, string> {
  const path = `tasks/${version.id}/task.yaml`;
  const text = version.files[path];

  if (text === undefined) {
    return { ...version.files };
  }

  let parsed: unknown;

  try {
    parsed = Bun.YAML.parse(text);
  } catch {
    return { ...version.files };
  }

  const mapping = recordSchema.safeParse(parsed);

  // Only text that is exactly the renderer's output is rewritten, so a hand-written file and its
  // comments stay as they are.
  if (!mapping.success || !('target' in mapping.data) || renderTaskYAML(mapping.data) !== text) {
    return { ...version.files };
  }

  const { target: _target, ...rest } = mapping.data;

  return { ...version.files, [path]: renderTaskYAML(rest) };
}

// A frozen copy of the definitions module's task.yaml renderer.
function renderTaskYAML(mapping: Readonly<Record<string, unknown>>): string {
  return `${Bun.YAML.stringify(mapping, null, 2).replace(/\n+$/u, '')}\n`;
}

// A frozen copy of the hash that the definitions module builds from a folder, so a later change to
// that module never changes this migration's hashes.
function buildDefinitionHash(version: Version): string {
  const instructions = version.files[`tasks/${version.id}/instructions.md`];
  const step = recordSchema.safeParse(version.form['step']);
  const stepFile = step.success ? step.data['file'] : undefined;

  const stepText =
    typeof stepFile === 'string' ? version.files[`tasks/${version.id}/${stepFile}`] : undefined;

  const parts = {
    id: version.id,
    form: version.form,
    instructions:
      instructions === undefined ? null : buildSHA256(normalizeInstructions(instructions)),
    step: stepText === undefined ? null : buildSHA256(stepText),
  };

  return buildSHA256(toCanonicalJSON(parts));
}

function buildSHA256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function normalizeInstructions(text: string): string {
  const body = text
    .replace(/^﻿/u, '')
    .replaceAll(/\r\n?/gu, '\n')
    .normalize('NFC')
    .replace(/\n+$/u, '');

  return `${body}\n`;
}

async function removeVersions(tx: Transaction<unknown>, hashes: readonly string[]): Promise<void> {
  for (const hash of hashes) {
    await sql`delete from task_definition_versions where definition_hash = ${hash}`.execute(tx);
  }
}

const hashColumns = [
  ['tasks', 'definition_hash'],
  ['runtime_task_definitions', 'definition_hash'],
  ['runtime_task_definitions', 'previous_hash'],
  ['runtime_task_definitions', 'base_hash'],
  ['runtime_task_definitions', 'definitions_hash'],
  ['trigger_definitions', 'definition_hash'],
] as const;

async function repointColumns(tx: Transaction<unknown>, hashes: HashMap): Promise<void> {
  for (const [table, column] of hashColumns) {
    for (const [oldHash, newHash] of hashes) {
      await sql`update ${sql.table(table)} set ${sql.id(column)} = ${newHash}
        where ${sql.id(column)} = ${oldHash}`.execute(tx);
    }
  }
}

const pageSize = 500;

async function rewriteRecords(
  tx: Transaction<unknown>,
  hashes: HashMap,
  removed: ReadonlySet<string>,
): Promise<void> {
  let after = 0;
  let isDone = false;

  while (!isDone) {
    const rows = await readQueryRows(
      sql`select sequence, kind, payload from records where sequence > ${after}
        order by sequence limit ${pageSize}`,
      tx,
      z.object({ sequence: z.number(), kind: z.string(), payload: z.string() }),
    );

    for (const row of rows) {
      const listed = row.kind === 'definitions_seeded' ? removed : null;
      const moved = moveText(row.payload, hashes, listed);

      if (moved !== null) {
        await sql`update records set payload = ${moved} where sequence = ${row.sequence}`.execute(
          tx,
        );
      }
    }

    after = rows.at(-1)?.sequence ?? after;
    isDone = rows.length < pageSize;
  }
}

// The text that moves every hash it holds as a whole value, or null when none moves. A hash that only
// a free-text field quotes stays, because the field holds more than the hash. The repoTasks list of a
// seed record also loses the entries of the removed hashes.
function moveText(
  text: string,
  hashes: HashMap,
  removed: ReadonlySet<string> | null,
): string | null {
  const found = text.match(/[0-9a-f]{64}/gu) ?? [];

  if (!found.some((hash) => hashes.has(hash) || removed?.has(hash) === true)) {
    return null;
  }

  const parsed: unknown = JSON.parse(text);
  const moved = JSON.stringify(moveValue(parsed, hashes, removed));

  return moved === JSON.stringify(parsed) ? null : moved;
}

function moveValue(value: unknown, hashes: HashMap, removed: ReadonlySet<string> | null): unknown {
  if (typeof value === 'string') {
    return hashes.get(value) ?? value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => moveValue(item, hashes, removed));
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === 'repoTasks' && removed !== null && Array.isArray(item)
          ? item
              .filter((entry) => !isRemovedEntry(entry, removed))
              .map((entry) => moveValue(entry, hashes, null))
          : moveValue(item, hashes, removed),
      ]),
    );
  }

  return value;
}

function isRemovedEntry(entry: unknown, removed: ReadonlySet<string>): boolean {
  const parsed = recordSchema.safeParse(entry);
  const hash = parsed.success ? parsed.data['hash'] : undefined;

  return typeof hash === 'string' && removed.has(hash);
}

async function rewriteProjectionChanges(tx: Transaction<unknown>, hashes: HashMap): Promise<void> {
  const rows = await readQueryRows(
    sql`select rowid as id, row as text from projection_changes where row is not null`,
    tx,
    z.object({ id: z.number(), text: z.string() }),
  );

  for (const row of rows) {
    const moved = moveText(row.text, hashes, null);

    if (moved !== null) {
      await sql`update projection_changes set row = ${moved} where rowid = ${row.id}`.execute(tx);
    }
  }
}

const snapshotTaskSchema = z.looseObject({ hash: z.string() });

// A snapshot form lists its task definitions with their hashes. It is stored in canonical JSON.
async function rewriteSnapshotForms(
  tx: Transaction<unknown>,
  hashes: HashMap,
  removed: ReadonlySet<string>,
): Promise<void> {
  const rows = await readQueryRows(
    sql`select snapshot_hash, form from definition_snapshots`,
    tx,
    z.object({ snapshot_hash: z.string(), form: z.string() }),
  );

  for (const row of rows) {
    const form = recordSchema.safeParse(JSON.parse(row.form));
    const tasks = z.array(snapshotTaskSchema).safeParse(form.data?.['tasks']);

    if (!form.success || !tasks.success) {
      continue;
    }

    const kept: Record<string, unknown>[] = [];

    for (const task of tasks.data) {
      if (!removed.has(task.hash)) {
        kept.push({ ...task, hash: hashes.get(task.hash) ?? task.hash });
      }
    }

    if (JSON.stringify(kept) === JSON.stringify(tasks.data)) {
      continue;
    }

    await sql`update definition_snapshots set form = ${toCanonicalJSON({ ...form.data, tasks: kept })}
      where snapshot_hash = ${row.snapshot_hash}`.execute(tx);
  }
}
