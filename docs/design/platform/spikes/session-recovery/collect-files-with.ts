import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Every file under the folders that holds the text, found by reading each file whole. It skips the
// excluded folders, so a scan of /tmp leaves out a task directory that itself sits under /tmp.
export function collectFilesWith(dirs: string[], text: string, excluded: string[] = []): string[] {
  const found: string[] = [];
  const visit = (path: string): void => {
    if (excluded.some((dir) => isInside(path, dir))) {
      return;
    }
    let stat;
    try {
      stat = statSync(path);
    } catch {
      return;
    }
    if (stat.isDirectory()) {
      let names: string[] = [];
      try {
        names = readdirSync(path);
      } catch {
        return;
      }
      for (const name of names) {
        visit(join(path, name));
      }
    } else if (stat.isFile() && stat.size < 50_000_000) {
      try {
        if (readFileSync(path).includes(text)) {
          found.push(path);
        }
      } catch {
        // a file the scan cannot read belongs to another user
      }
    }
  };
  for (const dir of dirs) {
    visit(dir);
  }
  return found;
}

function isInside(path: string, dir: string): boolean {
  const rel = relative(dir, path);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('/'));
}
