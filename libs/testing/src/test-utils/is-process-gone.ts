import { readFileSync } from 'node:fs';

// Whether a process has died: it is gone from /proc, or it is a zombie that waits for its parent to
// reap it. A process reaped between two reads of /proc counts as gone.
export function isProcessGone(pid: number): boolean {
  try {
    return readFileSync(`/proc/${pid}/stat`, 'utf8').includes(') Z ');
  } catch {
    return true;
  }
}
