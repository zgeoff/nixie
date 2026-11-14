import type { LogFields } from '@heynixie/logger';
import { runCLI } from '../run-cli';

export interface HostCommandRun {
  readonly exitCode: number;
  readonly stdout: string;

  readonly logged: readonly Readonly<Record<string, unknown>>[];
}

export async function runHostCommand(
  configPath: string,
  args: readonly string[],
): Promise<HostCommandRun> {
  const printed: string[] = [];
  const logged: Readonly<Record<string, unknown>>[] = [];

  const exitCode = await runCLI([...args, '--config', configPath], {
    log: (event, fields: LogFields = {}) => {
      logged.push({ ...fields, event });
    },
    print: (text) => {
      printed.push(`${text}\n`);
    },
    writeBytes: (bytes) => {
      printed.push(new TextDecoder().decode(bytes));
    },
    waitForSignal: () => new Promise(() => {}),
  });

  return { exitCode, stdout: printed.join(''), logged };
}
