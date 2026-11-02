// The backup passwords reach only the backup container, and nixie's secrets never reach it: the
// backup container mounts the data volume's staging subpath and nothing else.
export function findCredentialBreach(config: unknown): string | null {
  const services = findField(config, 'services');
  const environment = findField(findField(services, 'nixie'), 'environment');
  const volumes = findField(findField(services, 'nixie-backup'), 'volumes');
  const nixieNames = isObject(environment) ? Object.keys(environment) : [];

  if (nixieNames.some((name) => name.startsWith('NIXIE_BACKUP_'))) {
    return 'the nixie service holds a backup variable';
  }

  const mounts = Array.isArray(volumes) ? volumes.map((volume: unknown) => volume) : [];

  if (mounts.some((volume) => findField(volume, 'source') === 'secrets')) {
    return 'the nixie-backup service mounts the secrets volume';
  }

  const [staging] = mounts;

  if (
    mounts.length !== 1 ||
    findField(staging, 'source') !== 'data' ||
    findField(findField(staging, 'volume'), 'subpath') !== 'backup'
  ) {
    return 'the nixie-backup service mounts more than the staging subpath of data';
  }

  return null;
}

function findField(value: unknown, key: string): unknown {
  if (!isObject(value)) {
    return undefined;
  }

  const field: unknown = Reflect.get(value, key);

  return field;
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}
