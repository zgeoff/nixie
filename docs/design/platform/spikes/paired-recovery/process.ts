/* oxlint-disable one-var -- sequential fixture process setup */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface RunOptions {
  input?: Uint8Array;
  output?: string;
}

export interface FixtureRuntime {
  run: (args: string[], options?: RunOptions) => Promise<string>;
  start: (args: string[], label: string) => Bun.Subprocess;
  stop: (process: Bun.Subprocess, signal?: 'SIGTERM' | 'SIGKILL') => Promise<void>;
  close: () => Promise<void>;
}

async function stop(process: Bun.Subprocess, signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM') {
  if (process.exitCode !== null || process.signalCode !== null) {
    return;
  }
  process.kill(signal);
  const timer = setTimeout(() => process.kill('SIGKILL'), 2000);
  try {
    await process.exited;
  } finally {
    clearTimeout(timer);
  }
}

export function createRuntime(dir: string): FixtureRuntime {
  const children: Bun.Subprocess[] = [];
  const env = {
    PATH: process.env.PATH ?? '',
    RCLONE_CACHE_DIR: join(dir, 'cache'),
    RESTIC_PASSWORD: 'public-fixture-restic-password',
  };
  return {
    run: async (args, options) => {
      const process = Bun.spawn(args, {
        env,
        stdin: options?.input ?? 'ignore',
        stdout: options?.output ? Bun.file(options.output) : 'pipe',
        stderr: 'pipe',
      });
      children.push(process);
      const timer = setTimeout(() => process.kill('SIGKILL'), 30_000);
      try {
        const [out, err, code] = await Promise.all([
          options?.output ? Promise.resolve('') : new Response(process.stdout).text(),
          new Response(process.stderr).text(),
          process.exited,
        ]);
        if (code !== 0) {
          throw new Error(`${args[0]} failed (${code}): ${err}`);
        }
        return out;
      } finally {
        clearTimeout(timer);
      }
    },
    start: (args, label) => {
      const process = Bun.spawn(args, {
        env,
        stdout: Bun.file(join(dir, `${label}.stdout`)),
        stderr: Bun.file(join(dir, `${label}.stderr`)),
      });
      children.push(process);
      return process;
    },
    stop,
    close: async () => {
      const results = await Promise.allSettled(children.map((process) => stop(process)));
      const failed = results.find((result) => result.status === 'rejected');
      if (failed?.status === 'rejected') {
        throw failed.reason;
      }
    },
  };
}

export async function createReplicaConfig(
  dir: string,
  database: string,
  endpoint: string,
): Promise<string> {
  const config = join(dir, 'litestream.yml');
  await writeFile(
    config,
    `dbs:\n  - path: ${database}\n    replica:\n      type: s3\n      bucket: replica\n      path: data\n      endpoint: ${endpoint}\n      region: us-east-1\n      force-path-style: true\n      access-key-id: fixture\n      secret-access-key: fixture-secret\n      sync-interval: 1s\n`,
  );
  return config;
}
