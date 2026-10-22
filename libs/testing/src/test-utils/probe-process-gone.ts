import { readFileSync } from 'node:fs';
import { isProcessStatGone } from './is-process-stat-gone';

export function probeProcessGone(pid: number): boolean {
  try {
    return isProcessStatGone(readFileSync(`/proc/${pid}/stat`, 'utf8'));
  } catch {
    return true;
  }
}
