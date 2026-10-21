import { readFileSync } from 'node:fs';

export function probeProcessGone(pid: number): boolean {
  try {
    return readFileSync(`/proc/${pid}/stat`, 'utf8').includes(') Z ');
  } catch {
    return true;
  }
}
