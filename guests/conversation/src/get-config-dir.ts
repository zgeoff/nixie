import { join } from 'node:path';

export function getConfigDir(home: string): string {
  return join(home, '.claude');
}
