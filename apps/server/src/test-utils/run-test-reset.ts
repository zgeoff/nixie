import { buildTestClient } from '@heynixie/api/test-utils';
import type { ContractClient } from '@heynixie/contract';
import type { LogRecord } from '@heynixie/log';
import type { HostCommandRun } from './run-host-command';
import { runHostCommand } from './run-host-command';
import type { TestNixie } from './start-test-nixie';

export interface TestReset {
  // the reset command's exit code and stdout, and the exit code of the server it reset
  readonly command: HostCommandRun;
  readonly serverExit: number;

  // the old log's highest sequence, from the server's log line of the finished reset
  readonly lastSequence: number;

  // the server started again on the same data directory, once it is ready
  readonly again: TestNixie;

  // a client of the server started again: the device that holds the token, or signed out
  readonly connect: (token?: string) => ContractClient;

  // stops the server started again, then reads every record with its decrypted fields
  readonly stop: () => Promise<{ readonly exitCode: number; readonly records: LogRecord[] }>;
}

// Runs the reset command against a running test nixie, waits for the server to exit, and starts it
// again on the same data directory, as the container runtime does, until it is ready.
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
