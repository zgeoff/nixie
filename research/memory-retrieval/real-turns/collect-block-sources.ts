import { z } from 'zod';
import type { BlockSources, VersionMeta } from './build-block-tokens.ts';
import type { PlainExport } from './read-plain-export.ts';

const subjectSchema = z.enum(['owner', 'self', 'shared']).catch('owner');
const originSchema = z.enum(['owner', 'conversation', 'task', 'memory_writer', 'lapse']).catch('owner');
const sourceSchema = z.enum(['owner', 'owner_data', 'untrusted']).catch('owner');

// Gathers what the renderers need beyond a turn's own fields: each version's line details.
export function collectBlockSources(data: PlainExport): BlockSources {
  const items = new Map(data.items.map((item) => [item.item_id, item]));
  const versions = new Map<string, VersionMeta>();

  for (const version of data.versions) {
    const item = items.get(version.item_id);

    versions.set(`${version.item_id}@${version.version}`, {
      shortID: item?.short_id ?? 'm0000000000',
      subject: subjectSchema.parse(item?.subject ?? (item?.kind === 'self' ? 'self' : 'owner')),
      origin: originSchema.parse(version.origin),
      source: sourceSchema.parse(version.source),
      recordedAt: version.recorded_at ?? 0,
      quote: version.quote ?? null,
    });
  }

  return { versions };
}
