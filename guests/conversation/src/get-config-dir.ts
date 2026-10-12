import { join } from 'node:path';

// The CLI's config folder under the guest's home, which holds every session transcript and fork.
export function getConfigDir(home: string): string {
  return join(home, '.claude');
}
