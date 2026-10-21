import { join } from 'node:path';

export function getWorkDir(home: string): string {
  return join(home, 'conversation');
}
