import type { BackupSetKind } from '@heynixie/wire';

export interface SnapshotTagValues {
  readonly set: number;
  readonly kind: BackupSetKind;
  readonly publish: number;
  readonly legacySet: number | null;
  readonly provenFrom: number | null;
}

export function formatSnapshotTags(tags: SnapshotTagValues): string[] {
  return [
    `set-${String(tags.set)}`,
    `kind-${tags.kind}`,
    `publish-${String(tags.publish)}`,
    ...(tags.legacySet === null ? [] : [`legacy-set-${String(tags.legacySet)}`]),
    ...(tags.provenFrom === null ? [] : [`proven-from-${String(tags.provenFrom)}`]),
  ];
}
