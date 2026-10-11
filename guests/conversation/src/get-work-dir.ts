import { join } from 'node:path';

// The neutral working directory under the guest's home. The CLI's prompt carries it, and a host
// path would mislead the model about where anything runs.
export function getWorkDir(home: string): string {
  return join(home, 'conversation');
}
