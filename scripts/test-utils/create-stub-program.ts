import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

interface StubAnswer {
  readonly stdout?: string;
  readonly exitCode?: number;
}

export interface StubProgramOptions {
  // Each call appends one line: the program's file name, then its arguments joined by spaces.
  readonly callsPath: string;

  // Keyed by the call's arguments joined by spaces; a call with no key prints nothing and exits 0.
  readonly answers?: Readonly<Record<string, StubAnswer>>;
}

export function createStubProgram(path: string, options: Readonly<StubProgramOptions>): void {
  mkdirSync(dirname(path), { recursive: true });

  writeFileSync(
    path,
    [
      `#!${process.execPath}`,
      "import { appendFileSync } from 'node:fs';",
      `const answers = ${JSON.stringify(options.answers ?? {})};`,
      "const key = process.argv.slice(2).join(' ');",
      `appendFileSync(${JSON.stringify(options.callsPath)}, ${JSON.stringify(`${basename(path)} `)} + key + '\\n');`,
      'const answer = answers[key] ?? {};',
      "process.stdout.write(answer.stdout ?? '');",
      'process.exit(answer.exitCode ?? 0);',
      '',
    ].join('\n'),
  );

  chmodSync(path, 0o755);
}
