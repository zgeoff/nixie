import type { AppServerProcess } from '../app-server/start-app-server';

// Starts `codex app-server` with a strict config, so a config key that the pinned CLI lacks stops
// it at the start.
export function startCodexProcess(env: Record<string, string>, cwd: string): AppServerProcess {
  const child = Bun.spawn(['codex', 'app-server', '--strict-config'], {
    env,
    cwd,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  return {
    stdin: {
      write: (text) => child.stdin.write(text),
      end: () => child.stdin.end(),
    },
    stdout: child.stdout,
    stderr: child.stderr,
    exited: child.exited,
    kill: () => {
      child.kill();
    },
  };
}
