// A stand-in for a test build of nixie, for the harness's own tests: it answers now, holds
// stub.point for hold, and starts a sleeping child for startChild. With STUB_NIXIE_REFUSE set, it
// exits with code 3 before it is ready, as a nixie that finds the writer lock held does.
import { startHarnessLink } from '../start-harness-link';

const link = startHarnessLink();

link.registerOperation('now', () => link.clock.now());
link.registerOperation('hold', async (args) => {
  await link.waitAtFaultPoint('stub.point', { kind: 'stub', id: String(args) });
  return 'released';
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
