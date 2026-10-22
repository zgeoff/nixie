import { makeLogger, startLineLog, toErrorFields } from '@heynixie/logger';
import { cli, define } from 'gunshi';
import { startCountingProxy } from './start-counting-proxy';

const received = Promise.withResolvers<string>();

process.once('SIGTERM', () => {
  received.resolve('SIGTERM');
});

process.once('SIGINT', () => {
  received.resolve('SIGINT');
});

await startLineLog((line) => {
  process.stdout.write(line);
});

const log = makeLogger();

// inside systemd's default stop timeout, past which the kill would lose the count of each reply
// still under way
const drainTimeoutMs = 30_000;

const command = define({
  name: 'counting-proxy',
  description: 'Counts the spend of each model reply and refuses requests past the limit',
  args: { config: { type: 'string', required: true, description: 'the proxy config file' } },
  run: async (ctx) => {
    const proxy = await startCountingProxy({
      configPath: ctx.values.config,
      log,
      drainTimeoutMs,
    });

    log('signal.received', { signal: await received.promise });

    await proxy.stop();
  },
});

try {
  await cli(process.argv.slice(2), command);

  process.exit(0);
} catch (error) {
  // the proxy fails closed: with no proxy, the route it serves has no way out
  log('proxy.failed', toErrorFields(error), 'error');

  process.exit(1);
}
