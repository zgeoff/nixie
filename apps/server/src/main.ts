// nixie's entry point, which the release bundle starts as PID 1: it runs one command and exits with
// its code, so a stop that leaves a step past its grace still ends the process.
import { makeLogger } from '@heynixie/ops';
import { runCLI } from './run-cli';

// The handlers exist before the command starts, so a signal during the start, such as one that
// arrives while migrations run, still stops nixie once the start reaches the stop.
const received = Promise.withResolvers<string>();

process.once('SIGTERM', () => {
  received.resolve('SIGTERM');
});

process.once('SIGINT', () => {
  received.resolve('SIGINT');
});

const exitCode = await runCLI(process.argv.slice(2), {
  log: makeLogger((line) => {
    process.stdout.write(line);
  }),
  print: (text) => {
    process.stdout.write(`${text}\n`);
  },
  waitForSignal: () => received.promise,
});

process.exit(exitCode);
