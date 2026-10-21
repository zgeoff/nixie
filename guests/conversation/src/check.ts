import { runCheckGuest } from './run-check-guest';

const writer = Bun.stdout.writer();

await runCheckGuest({
  input: Bun.stdin.stream(),
  write: async (bytes) => {
    await writer.write(bytes);
    await writer.flush();
  },
  env: process.env,
});

process.exit(0);
