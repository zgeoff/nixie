import type { BackupSetKind } from '@heynixie/wire';

export interface ParsedSnapshotTags {
  readonly set: number | null;
  readonly kind: BackupSetKind | null;
  readonly publish: number | null;
  readonly legacySet: number | null;
  readonly provenFrom: number | null;
}

// A tag that does not parse reads as absent, and so does a prefix that appears twice.
export function parseSnapshotTags(tags: readonly string[]): ParsedSnapshotTags {
  const kind = findTagValue(tags, 'kind-');

  return {
    set: toPositiveInteger(findTagValue(tags, 'set-')),
    kind: kind === 'scheduled' || kind === 'forget' ? kind : null,
    publish: toPositiveInteger(findTagValue(tags, 'publish-')),
    legacySet: toPositiveInteger(findTagValue(tags, 'legacy-set-')),
    provenFrom: toPositiveInteger(findTagValue(tags, 'proven-from-')),
  };
}

function findTagValue(tags: readonly string[], prefix: string): string | null {
  const values = tags
    .filter((tag) => tag.startsWith(prefix))
    .map((tag) => tag.slice(prefix.length));

  return values.length === 1 ? (values[0] ?? null) : null;
}

function toPositiveInteger(value: string | null): number | null {
  if (value === null || !/^[1-9]\d*$/u.test(value)) {
    return null;
  }

  const number = Number(value);

  return Number.isSafeInteger(number) ? number : null;
}
