import { z } from 'zod';

export const pairRelations = ['same-publish', 'older-data'] as const;

export type PairRelation = (typeof pairRelations)[number];

// fetched-pair.json, at the root of the fetch's directory
export const fetchedPairFile = 'fetched-pair.json';
const snapshotIDSchema = z.string().regex(/^[0-9a-f]{64}$/u);

const fetchedCopySchema = z.strictObject({
  snapshotID: snapshotIDSchema,
  publish: z.int().positive().nullable(),
  set: z.int().positive().nullable(),
  writtenAt: z.int().nonnegative(),
});

export const fetchedPairSchema = z
  .strictObject({
    format: z.literal(1),
    fetchedAt: z.int().nonnegative(),
    key: fetchedCopySchema,
    data: fetchedCopySchema,
    relation: z.enum(pairRelations),
  })
  .readonly();

export type FetchedCopy = z.infer<typeof fetchedCopySchema>;

export type FetchedPair = z.infer<typeof fetchedPairSchema>;
