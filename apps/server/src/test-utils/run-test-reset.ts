import { buildTestClient } from '@heynixie/api/test-utils';
import type { ContractClient } from '@heynixie/contract';
import type { LogRecord } from '@heynixie/log';
import type { HostCommandRun } from './run-host-command';
import { runHostCommand } from './run-host-command';
import type { TestNixie } from './start-test-nixie';

export interface TestReset {
  readonly command: HostCommandRun;
  readonly serverExit: number;

  readonly lastSequence: number;

  readonly again: TestNixie;

  readonly connect: (token?: string) => ContractClient;

  readonly stop: () => Promise<{ readonly exitCode: number; readonly records: LogRecord[] }>;
}

export async function runTestReset(nixie: TestNixie): Promise<TestReset> {
  const command = await runHostCommand(nixie.configPath, ['reset', '--keep-sessions', '--yes']);
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
      again.sendSignal('SIGTERM');

      return again.waitForExit();
    },
  };
}
