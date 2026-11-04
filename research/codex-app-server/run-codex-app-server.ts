import type { AppServerProcess } from './start-app-server.ts';

export function runCodexAppServer(env: Record<string, string>, cwd: string): AppServerProcess {
  return Bun.spawn(['codex', 'app-server', '--strict-config'], {
    cwd,
    env,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });
}
