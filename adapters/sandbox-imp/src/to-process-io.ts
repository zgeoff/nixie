import type { ProcessIO } from '@heynixie/sandbox';
import type { ImpExec } from './types';

// Wraps an imp exec as a process. A stop sends SIGTERM once, and the guest kills the exec's cgroup
// killGraceMs later. If impd never reports the exit, the adapter closes the session well after that.
export function toProcessIO(exec: ImpExec, killGraceMs: number): ProcessIO {
  const stopping = { isSent: false };

  return {
    stdout: exec.stdout,
    stderr: exec.stderr,
    write: exec.write,
    closeStdin: exec.closeStdin,
    exit: exec.exit,
    stop: () => {
      if (!stopping.isSent) {
        stopping.isSent = true;
        exec.sendSignal('SIGTERM');
        void stopAfterGrace(exec, killGraceMs + 10_000);
      }
    },
  };
}

async function stopAfterGrace(exec: ImpExec, delayMs: number): Promise<void> {
  const timer = Promise.withResolvers<'late'>();
  const timeout = setTimeout(() => {
    timer.resolve('late');
  }, delayMs);
  const outcome = await Promise.race([exec.exit, timer.promise]);

  clearTimeout(timeout);
  if (outcome === 'late') {
    exec.close();
  }
}
