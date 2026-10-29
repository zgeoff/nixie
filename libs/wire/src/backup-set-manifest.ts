import { z } from 'zod';

export const backupSetFiles = ['nixie.db', 'keys.db'] as const;

export type BackupSetFile = (typeof backupSetFiles)[number];

const backupSetKinds = ['scheduled', 'forget'] as const;

export type BackupSetKind = (typeof backupSetKinds)[number];

const backupSetCopySchema = z
  .strictObject({
    name: z.enum(backupSetFiles),
    bytes: z.int().nonnegative(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  })
  .readonly();

export const backupSetManifestSchema = z
  .strictObject({
    format: z.literal(1),
    kind: z.enum(backupSetKinds),
    sequence: z.int().positive(),
    stagedAt: z.int().nonnegative(),
    copies: z
      .array(backupSetCopySchema)
      .readonly()
      .refine(
        (copies) =>
          copies.length === backupSetFiles.length &&
          backupSetFiles.every((file) => copies.some((copy) => copy.name === file)),
        { message: 'a set holds one copy of nixie.db and one of keys.db' },
      ),
  })
  .readonly();

export type BackupSetManifest = z.infer<typeof backupSetManifestSchema>;
