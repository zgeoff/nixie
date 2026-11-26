import type { Kysely } from 'kysely';
import type { DeviceTables } from '../types';
import type { DevicePackage } from './types';

// The packages the owner approved, oldest first.
export async function readDevicePackages(db: Kysely<unknown>): Promise<readonly DevicePackage[]> {
  const rows = await db
    .$extendTables<DeviceTables>()
    .selectFrom('device_packages')
    .selectAll()
    .orderBy('added_sequence')
    .execute();

  return rows.map((row) => toDevicePackage(row));
}

// The approved package of this name and version, or null.
export async function readDevicePackage(
  db: Kysely<unknown>,
  name: string,
  version: string,
): Promise<DevicePackage | null> {
  const row = await db
    .$extendTables<DeviceTables>()
    .selectFrom('device_packages')
    .selectAll()
    .where('package_id', '=', `${name}@${version}`)
    .executeTakeFirst();

  return row === undefined ? null : toDevicePackage(row);
}

interface PackageRow {
  readonly name: string;
  readonly version: string;
  readonly integrity: string;
  readonly unpacked_bytes: number;
  readonly publisher: string;
  readonly files: string;
  readonly added_sequence: number;
}

function toDevicePackage(row: PackageRow): DevicePackage {
  const files: unknown = JSON.parse(row.files);

  return {
    name: row.name,
    version: row.version,
    integrity: row.integrity,
    unpackedBytes: row.unpacked_bytes,
    publisher: row.publisher,
    files: Array.isArray(files) ? files.filter((file) => typeof file === 'string') : [],
    addedSequence: row.added_sequence,
  };
}
