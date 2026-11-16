import { makeLogger, startLineLog, toErrorFields } from '@heynixie/logger';
import { cli, define } from 'gunshi';
import { z } from 'zod';
import { runRaise } from './override/run-raise';
import { startModelGateway } from './proxy/start-model-gateway';

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

const serve = define({
  name: 'serve',
  description: 'Counts the spend of each model reply and refuses requests past the limit',
  args: { config: { type: 'string', required: true, description: 'the proxy config file' } },
  run: async (ctx) => {
    const proxy = await startModelGateway({
      configPath: ctx.values.config,
      log,
      waitForDrainDeadline: () => Bun.sleep(drainTimeoutMs),
    });

    log('signal.received', { signal: await received.promise });

    await proxy.stop();
  },
});

const raise = define({
  name: 'raise',
  description:
    'Writes the override file that raises a period past its cap, for the period now in force',
  args: {
    config: { type: 'string', required: true, description: 'the proxy config file' },
    period: { type: 'enum', choices: ['day', 'month'], required: true },
    dollars: { type: 'number', required: true, description: 'the dollar limit to set' },
    tokens: { type: 'number', required: true, description: 'the token limit to set' },
  },
  run: async (ctx) => {
    const override = await runRaise({
      configPath: ctx.values.config,
      period: z.enum(['day', 'month']).parse(ctx.values.period),
      dollars: ctx.values.dollars,
      tokens: ctx.values.tokens,
      now: Date.now,
    });

    log('override.written', {
      period: override.period,
      start: override.start,
      dollars: override.limit.dollars,
      tokens: override.limit.tokens,
    });
  },
});

try {
  // with no subcommand the command serves, as each host's unit and the release run it
  await cli(process.argv.slice(2), serve, {
    name: 'model-gateway',
    subCommands: { serve, raise },
  });

  process.exit(0);
} catch (error) {
  // the proxy fails closed: with no proxy, the route it serves has no way out
  log('proxy.failed', toErrorFields(error), 'error');

  process.exit(1);
}
