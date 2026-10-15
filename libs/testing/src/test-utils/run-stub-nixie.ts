// A stand-in for a test build of nixie, for the harness's own tests. With STUB_NIXIE_REFUSE set, it
// exits with code 3 before it is ready, as a nixie that finds the writer lock held does.
import { startHarnessLink } from '../start-harness-link';

const link = startHarnessLink();

link.registerOperation('now', () => link.clock.now());

link.registerOperation('hold', async (args) => {
  await link.waitAtFaultPoint('stub.point', { kind: 'stub', id: String(args) });

  return 'released';
});

// a sleeper that never sleeps again once it wakes, as a step that an advance starts
link.registerOperation('sleepOnce', (args) => {
  void link.clock.sleep(Number(args));

  return null;
});

// a loop that sleeps again each time it wakes, as a runner
link.registerOperation('startPoll', (args) => {
  void (async () => {
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- a poll
      await link.clock.sleep(Number(args));
    }
  })();

  return null;
});

link.registerOperation('startChild', () => {
  const child = Bun.spawn(['sleep', '60'], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  return child.pid;
});

if (process.env['STUB_NIXIE_REFUSE'] === '1') {
  process.stderr.write('the stub refused to start\n');
  process.exit(3);
}

link.sendReady();
