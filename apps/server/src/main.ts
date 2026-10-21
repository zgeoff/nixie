import { makeLogger, startLineLog } from '@heynixie/logger';
import { runCLI } from './run-cli';

const received = Promise.withResolvers<string>();

process.once('SIGTERM', () => {
  received.resolve('SIGTERM');
});

process.once('SIGINT', () => {
  received.resolve('SIGINT');
});

// Each line reaches stdout before the write returns, so it lands in order with what the command
// prints and the exit loses none.
await startLineLog((line) => {
  process.stdout.write(line);
});

const exitCode = await runCLI(process.argv.slice(2), {
  log: makeLogger(),
  print: (text) => {
    process.stdout.write(`${text}\n`);
  },
  waitForSignal: () => received.promise,
});

process.exit(exitCode);
