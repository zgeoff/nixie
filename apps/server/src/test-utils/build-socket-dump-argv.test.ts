import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@zgeoff/testing';
import { buildSocketDumpArgv } from './build-socket-dump-argv';
import { parseSocketDump } from './parse-socket-dump';

function setupTest() {
  return {
    runDump: async (command: string) => {
      const child = Bun.spawn(buildSocketDumpArgv(command), { stdout: 'pipe', stderr: 'pipe' });

      const output = await new Response(child.stdout).text();

      return parseSocketDump(output);
    },
  };
}

test('it dumps the TCP listener of the process it names, under that process', async () => {
  const ctx = setupTest();

  // PR_SET_NAME, 15, gives the process the name that the dump looks for
  const child = Bun.spawn(
    [
      'python3',
      '-c',
      [
        'import ctypes, socket, time',
        'ctypes.CDLL(None).prctl(15, b"nixiedumptarget", 0, 0, 0)',
        's = socket.socket()',
        's.bind(("127.0.0.1", 0))',
        's.listen()',
        'time.sleep(60)',
      ].join('\n'),
    ],
    { stdout: 'ignore', stderr: 'ignore' },
  );

  onTestFinished(() => {
    child.kill();
  });

  await waitFor(async () => {
    const dump = await ctx.runDump('nixiedumptarget');

    expect(dump.processes.map((process) => process.inet)).toStrictEqual([
      [{ table: 'tcp', local: expect.stringMatching(/^0100007F:[0-9A-F]{4}$/v), state: '0A' }],
    ]);
  });
});

test('it dumps its own TCP listener and UDP socket as the control', async () => {
  const ctx = setupTest();

  const dump = await ctx.runDump('nixie-no-such-process');

  expect([dump.processes, dump.control.inet]).toStrictEqual([
    [],
    [
      { table: 'tcp', local: expect.stringMatching(/^0100007F:/v), state: '0A' },
      { table: 'udp', local: expect.stringMatching(/^0100007F:/v), state: '07' },
    ],
  ]);
});
