import { z } from 'zod';
import { startHarnessLink } from '../start-harness-link';

const link = startHarnessLink();

link.registerOperation('now', z.null(), () => link.clock.now());

link.registerOperation('hold', z.string(), async (workID) => {
  await link.waitAtFaultPoint('stub.point', { kind: 'stub', id: workID });

  return 'released';
});

link.registerOperation('sleepOnce', z.number(), (durationMs) => {
  void link.clock.sleep(durationMs);

  return null;
});

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
