import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Clock, Sweep } from '@heynixie/clock';
import { startSweep } from '@heynixie/clock';

export interface HeartbeatOptions {
  readonly path: string;
  readonly clock: Clock;
  readonly intervalMs: number;
  readonly onError: (error: unknown) => void;
}

export function startHeartbeat(options: HeartbeatOptions): Pick<Sweep, 'stop'> {
  return startSweep({
    clock: options.clock,
    intervalMs: options.intervalMs,
    runOnStart: true,
    onError: options.onError,
    run: async () => {
      await mkdir(dirname(options.path), { recursive: true });

      await Bun.write(options.path, String(options.clock.now()));
    },
  });
}
