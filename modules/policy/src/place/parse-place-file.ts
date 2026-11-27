import { z } from 'zod';
import { checkPlaceKey } from './check-place-key';
import { formatPlaceKey } from './format-place-key';
import { parsePlacePattern } from './parse-place-pattern';
import type { PlaceKey, Trust } from './types';

export interface PlaceFileEntry {
  readonly key: PlaceKey;
  readonly trust: Exclude<Trust, 'self'>;
  readonly name: string | null;
}

export type ParsedPlaceFile =
  | { readonly status: 'parsed'; readonly places: readonly PlaceFileEntry[] }
  | { readonly status: 'refused'; readonly problems: readonly string[] };

const entrySchema = z.strictObject({
  place: z.string(),
  trust: z.enum(['blocked', 'known', 'read', 'act']),
  name: z.string().optional(),
});

const fileSchema = z.array(entrySchema);

// Reads places.yaml, a list of `{ place, trust, name? }` with site and mail domain entries only. One
// bad line refuses the whole file, as a bad effects file refuses the seed. An address, a phone
// number or a handle never comes from the definitions repo.
export function parsePlaceFile(text: string): ParsedPlaceFile {
  const content = parseYAML(text);

  if (content.status === 'refused') {
    return content;
  }

  const shaped = fileSchema.safeParse(content.value ?? []);

  if (!shaped.success) {
    return {
      status: 'refused',
      problems: shaped.error.issues.map(
        (issue) => `${issue.path.map(String).join('.') || 'the file'}: ${issue.message}`,
      ),
    };
  }

  const problems: string[] = [];
  const places: PlaceFileEntry[] = [];

  const seen = new Set<string>();

  for (const [index, entry] of shaped.data.entries()) {
    const label = `entry ${index + 1} (${entry.place})`;
    const key = parsePlacePattern(entry.place);

    if (key === null) {
      problems.push(`${label}: not a place, or a key on a whole public suffix`);
    } else if (key.kind !== 'site' && key.kind !== 'mail_domain') {
      problems.push(`${label}: only a site or a mail domain can come from the definitions`);
    } else if (checkPlaceKey(key, entry.trust, 'seed') !== null) {
      problems.push(
        `${label}: a ${key.kind === 'site' ? 'site' : 'mail domain'} cannot be at ${entry.trust}`,
      );
    } else if (seen.has(`${key.kind}:${formatPlaceKey(key)}`)) {
      problems.push(`${label}: the file names this place twice`);
    } else {
      seen.add(`${key.kind}:${formatPlaceKey(key)}`);
      places.push({ key, trust: entry.trust, name: entry.name ?? null });
    }
  }

  return problems.length > 0 ? { status: 'refused', problems } : { status: 'parsed', places };
}

type YAMLRead =
  | { readonly status: 'read'; readonly value: unknown }
  | { readonly status: 'refused'; readonly problems: readonly string[] };

function parseYAML(text: string): YAMLRead {
  try {
    return { status: 'read', value: Bun.YAML.parse(text) };
  } catch (error) {
    return {
      status: 'refused',
      problems: [error instanceof Error ? error.message : String(error)],
    };
  }
}
