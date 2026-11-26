import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { SchemaTooNewError } from '../schema/schema-too-new-error';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { clientDevicesMigration } from './0095-client-devices-migration';

interface IdentityRow {
  readonly id: string;
  readonly scope: string;
  readonly label: string;
  readonly revokedAt?: number;
}

interface DeviceRowInput {
  readonly id: string;
  readonly identityID: string;
  readonly name: string;
  readonly screen: boolean;
}

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-client-devices-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(clientDevicesMigration),
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'identity.paired', 'snapshot-a', '{}')`.execute(db);

  return {
    db,
    upgrade: () => runMigrations(db, { schema: nixieSchema, copyDir: directory }),
    startPreviousRelease: () =>
      runMigrations(db, {
        schema: { migrations: nixieSchema.migrations.slice(0, 94), oldestReader: 0 },
        copyDir: directory,
      }),
    runAgain: () => db.transaction().execute((tx) => clientDevicesMigration.up(tx)),
    writeIdentity: (identity: IdentityRow) =>
      sql`insert into identities (
          identity_id, channel, external_id, label, token_hash, paired_at, last_seen_at,
          revoked_at, paired_sequence, scope
        ) values (
          ${identity.id}, 'client', ${identity.id}, ${identity.label}, ${`hash-${identity.id}`},
          5, 5, ${identity.revokedAt ?? null}, 1, ${identity.scope}
        )`.execute(db),
    writeDevice: (device: DeviceRowInput) =>
      sql`insert into devices (device_id, identity_id, name, capabilities, updated_at)
        values (
          ${device.id}, ${device.identityID}, ${device.name},
          ${JSON.stringify({ screen: device.screen })}, 1
        )`.execute(db),
    readDevices: async () => {
      const result = await sql`
        select identity_id, name, capabilities, device_kind from devices order by identity_id`.execute(
        db,
      );

      return result.rows;
    },
  };
}

test('it registers as migration 95, which the release before cannot read', () => {
  expect(nixieSchema.migrations.indexOf(clientDevicesMigration) + 1).toBe(95);
  expect(nixieSchema.oldestReader).toBeGreaterThanOrEqual(95);
});

test('it gives a full session with no row a client row named with its label and the screen on', async () => {
  const ctx = await setupTest();

  await ctx.writeIdentity({ id: 'full-1', scope: 'full', label: 'Kitchen laptop' });
  await ctx.upgrade();

  const devices = await ctx.readDevices();

  expect(devices).toStrictEqual([
    {
      identity_id: 'full-1',
      name: 'Kitchen laptop',
      capabilities: '{"screen":true,"camera":false,"speaker":false,"microphone":false}',
      device_kind: 'client',
    },
  ]);
});

test('it makes the row that a full session registered a client row that keeps its name and screen', async () => {
  const ctx = await setupTest();

  await ctx.writeIdentity({ id: 'full-1', scope: 'full', label: 'Enrolled name' });

  await ctx.writeDevice({
    id: 'dk4m7q2w9x',
    identityID: 'full-1',
    name: 'Registered',
    screen: false,
  });

  await ctx.upgrade();

  const devices = await ctx.readDevices();

  expect(devices).toStrictEqual([
    {
      identity_id: 'full-1',
      name: 'Registered',
      capabilities: '{"screen":false}',
      device_kind: 'client',
    },
  ]);
});

test('it keeps the row of a device session a screen row and gives a revoked session none', async () => {
  const ctx = await setupTest();

  await ctx.writeIdentity({ id: 'screen-1', scope: 'device', label: 'Hall panel' });

  await ctx.writeDevice({
    id: 'dk4m7q2w9y',
    identityID: 'screen-1',
    name: 'Hall panel',
    screen: true,
  });

  await ctx.writeIdentity({ id: 'gone-1', scope: 'full', label: 'Old phone', revokedAt: 9 });
  await ctx.upgrade();

  const devices = await ctx.readDevices();

  expect(devices).toStrictEqual([
    {
      identity_id: 'screen-1',
      name: 'Hall panel',
      capabilities: '{"screen":true}',
      device_kind: 'screen',
    },
  ]);
});

test('it writes no second row when it runs again', async () => {
  const ctx = await setupTest();

  await ctx.writeIdentity({ id: 'full-1', scope: 'full', label: 'Kitchen laptop' });
  await ctx.upgrade();
  await ctx.runAgain();

  const devices = await ctx.readDevices();

  expect(devices).toHaveLength(1);
});

test('it refuses to open the upgraded database to the release before it', async () => {
  const ctx = await setupTest();

  await ctx.upgrade();

  const run = ctx.startPreviousRelease();

  await Promise.allSettled([run]);

  expect(run).rejects.toBeInstanceOf(SchemaTooNewError);
});
