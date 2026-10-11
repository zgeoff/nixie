import { runConversationGuest } from './run-conversation-guest';

// The conversation image's entry: one turn over framed stdin and stdout.
const writer = Bun.stdout.writer();

await runConversationGuest({
  input: Bun.stdin.stream(),
  write: async (bytes) => {
    writer.write(bytes);
    await writer.flush();
  },
  env: process.env,
});
await writer.end();
