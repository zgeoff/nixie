import type { Log } from '@heynixie/log';
import { readRecordAttachments } from '@heynixie/log';
import { z } from 'zod';
import type { PackageMetadata } from './types';

const cardSchema = z.object({
  name: z.string(),
  version: z.string(),
  unpackedBytes: z.int().nonnegative().nullable(),
  publisher: z.string(),
  description: z.string(),
  integrity: z.string(),
});

export type PackageCard = z.output<typeof cardSchema>;

// The bytes that a call stores with its own record when it asks, so the card shows what the owner
// approves and the run installs only the hash that card showed.
export function toPackageCardBytes(metadata: PackageMetadata): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify(metadata));
}

// The card that a package call stored with its record, or null for a record with none or whose
// attachments a forget erased.
export async function readPackageCard(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  callSequence: number,
): Promise<PackageCard | null> {
  const found = await readRecordAttachments(log, [callSequence]);

  const attached = found.get(callSequence);
  const bytes = attached?.status === 'readable' ? attached.attachments[0] : undefined;

  if (bytes === undefined) {
    return null;
  }

  const parsed = cardSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));

  return parsed.success ? parsed.data : null;
}
