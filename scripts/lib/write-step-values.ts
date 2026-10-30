import { appendFileSync } from 'node:fs';

// GITHUB_OUTPUT and GITHUB_ENV each read one name=value pair per line.
export function writeStepValues(path: string, values: Readonly<Record<string, string>>): void {
  appendFileSync(
    path,
    Object.entries(values)
      .map(([name, value]) => `${name}=${value}\n`)
      .join(''),
  );
}
