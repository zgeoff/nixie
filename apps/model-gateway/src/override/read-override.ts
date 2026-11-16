import type { Override } from '../types';
import { overrideSchema } from './override-schema';

export type OverrideRead =
  | { readonly kind: 'none' }
  | { readonly kind: 'found'; readonly override: Override }
  | { readonly kind: 'unreadable'; readonly reason: string };

// A missing file is no override. A file that cannot be read, or holds no valid override, is
// reported so the caller can log it, and binds nothing: the limits in the store stay in force.
export async function readOverride(path: string): Promise<OverrideRead> {
  const file = Bun.file(path);

  if (!(await file.exists())) {
    return { kind: 'none' };
  }

  try {
    const stored: unknown = await file.json();

    const parsed = overrideSchema.safeParse(stored);

    return parsed.success
      ? { kind: 'found', override: parsed.data }
      : { kind: 'unreadable', reason: 'the file holds no valid override' };
  } catch {
    return { kind: 'unreadable', reason: 'the file could not be read' };
  }
}
