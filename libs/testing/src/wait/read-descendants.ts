import { readFileSync, readdirSync } from 'node:fs';

// Linux reparents a child to init when its parent dies, so the harness reads the tree before a kill.
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

// The command name in /proc/<pid>/stat can hold spaces and parentheses, so the fields count from
// its last closing parenthesis.
function readParentPID(pid: number): number | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');

    return Number(fields[1]);
  } catch {
    return null;
  }
}
