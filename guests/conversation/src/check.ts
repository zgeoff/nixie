import { runCheckGuest } from './run-check-guest';

// The checker's entry on the conversation image: one check over framed stdin and stdout. It exits
// once the reply is out.
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
