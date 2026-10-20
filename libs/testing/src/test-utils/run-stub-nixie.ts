// A stand-in for a test build of nixie, for the harness's own tests. With STUB_NIXIE_REFUSE set, it
// exits with code 3 before it is ready, as a nixie that finds the writer lock held does. With
// STUB_NIXIE_LATE_STDERR set too, a child it leaves behind writes to its stderr once it has exited.
import { z } from 'zod';
import { startHarnessLink } from '../start-harness-link';

const link = startHarnessLink();

link.registerOperation('now', z.null(), () => link.clock.now());

link.registerOperation('hold', z.string(), async (workID) => {
  await link.waitAtFaultPoint('stub.point', { kind: 'stub', id: workID });

  return 'released';
});

// a sleeper that never sleeps again once it wakes, as a step that an advance starts
link.registerOperation('sleepOnce', z.number(), (durationMs) => {
  void link.clock.sleep(durationMs);

  return null;
});

// a loop that sleeps again each time it wakes, as a runner
link.registerOperation('startPoll', z.number(), (intervalMs) => {
  void (async () => {
    for (;;) {
      await link.clock.sleep(intervalMs);
    }
  })();

  return null;
});

link.registerOperation('startChild', z.null(), () => {
  const child = Bun.spawn(['sleep', '60'], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  return child.pid;
});

// the child holds the stub's stderr open and waits for the stub's exit, so its line always lands
// after the exit
const lateStderrScript = `
while (true) {
  try { process.kill(${process.pid}, 0); } catch { break; }
  await Bun.sleep(10);
}
process.stderr.write('the last words\\n');
`;

if (process.env['STUB_NIXIE_LATE_STDERR'] === '1') {
  Bun.spawn([process.execPath, '-e', lateStderrScript], {
    detached: true,
    stdio: ['ignore', 'ignore', 'inherit'],
  }).unref();
}

if (process.env['STUB_NIXIE_REFUSE'] === '1') {
  process.stderr.write('the stub refused to start\n');
  process.exit(3);
}

link.sendReady();
