import { buildTestClient } from '@heynixie/api/test-utils';
import type { ContractClient } from '@heynixie/contract';
import type { LogRecord } from '@heynixie/log';
import type { HostCommandRun } from './run-host-command';
import { runHostCommand } from './run-host-command';
import type { InProcessNixie } from './start-in-process-nixie';

export interface TestReset {
  readonly command: HostCommandRun;
  readonly serverExit: number;
  readonly lastSequence: number;
  readonly again: InProcessNixie;
  readonly connect: (token?: string) => ContractClient;
  readonly stop: () => Promise<{ readonly exitCode: number; readonly records: LogRecord[] }>;
}

export async function runTestReset(
  nixie: InProcessNixie,
  args: readonly string[] = ['--keep-sessions', '--yes'],
): Promise<TestReset> {
  const command = await runHostCommand(nixie.configPath, ['reset', ...args]);
  const finished = await nixie.waitForLogEvent('reset.finished');
  const serverExit = await nixie.exited;

  const again = nixie.startAgain();

  const [listening] = await Promise.all([
    again.waitForLogEvent('http.listening'),
    again.waitForLogEvent('ready'),
  ]);

  const url = `http://127.0.0.1:${String(listening['port'])}`;

  return {
    command,
    serverExit,
    lastSequence: Number(finished['lastSequence']),
    again,
    connect: (token) => buildTestClient(url, token),
    stop: () => {
      again.signalStop();

      return again.waitForExit();
    },
  };
}
