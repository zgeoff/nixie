import { join } from 'node:path';

export function getHeartbeatPath(dataDir: string): string {
  return join(dataDir, 'run', 'heartbeat');
}
