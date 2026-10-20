import { readFileSync, readdirSync } from 'node:fs';

// Reads every process below pid from /proc. The harness reads them before a kill, because a child
// whose parent died is adopted by init and no longer names nixie.
export function readDescendants(pid: number): readonly number[] {
  const parents = readParentPIDs();
  const found: number[] = [];
  const queue = [pid];

  for (const current of queue) {
    const children = [...parents]
      .filter(([, parent]) => parent === current)
      .map(([child]) => child);

    found.push(...children);
    queue.push(...children);
  }

  return found;
}

function readParentPIDs(): ReadonlyMap<number, number> {
  const parents = new Map<number, number>();

  for (const entry of readdirSync('/proc')) {
    const parent = /^\d+$/u.test(entry) ? readParentPID(Number(entry)) : null;

    if (parent !== null) {
      parents.set(Number(entry), parent);
    }
  }

  return parents;
}

// the fourth field of /proc/<pid>/stat, after the command name in parentheses
function readParentPID(pid: number): number | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');

    return Number(fields[1]);
  } catch {
    return null;
  }
}
