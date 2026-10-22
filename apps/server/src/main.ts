import { makeLogger, startLineLog } from '@heynixie/logger';
import { runCLI } from './run-cli';

// The release bundle defines NIXIE_TEST_BUILD as false, so the bundler drops the harness and its
// import.
const harness = NIXIE_TEST_BUILD
  ? await import('./join-crash-harness').then((joined) => joined.joinCrashHarness())
  : null;

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
  ...(harness === null ? {} : { harness }),
});

process.exit(exitCode);
