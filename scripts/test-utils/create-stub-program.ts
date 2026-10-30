import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

interface StubAnswer {
  readonly stdout?: string;
  readonly exitCode?: number;
}

// A call's arguments joined by spaces, with an argument that holds a space or a quote in single
// quotes, as a shell writes it, so one argument never reads as two.
export interface StubProgramOptions {
  // Each call appends one line: the program's file name, then its arguments.
  readonly callsPath: string;

  // Keyed by the call's arguments; a call with no key prints nothing and exits 0.
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
      `const formatStubArgument = ${formatStubArgument.toString()};`,
      "const key = process.argv.slice(2).map(formatStubArgument).join(' ');",
      `appendFileSync(${JSON.stringify(options.callsPath)}, ${JSON.stringify(`${basename(path)} `)} + key + '\\n');`,
      'const answer = answers[key] ?? {};',
      "process.stdout.write(answer.stdout ?? '');",
      'process.exit(answer.exitCode ?? 0);',
      '',
    ].join('\n'),
  );

  chmodSync(path, 0o755);
}

// The stub runs this function's source, so it reads nothing outside its own body.
function formatStubArgument(argument: string): string {
  return /[\s'"]/u.test(argument) ? `'${argument.replaceAll("'", String.raw`'\''`)}'` : argument;
}
