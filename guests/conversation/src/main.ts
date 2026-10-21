import { runConversationGuest } from './run-conversation-guest';

const writer = Bun.stdout.writer();

await runConversationGuest({
  input: Bun.stdin.stream(),
  write: async (bytes) => {
    await writer.write(bytes);
    await writer.flush();
  },
  env: process.env,
});

// The host keeps stdin open after the turn ends, so the guest exits on its own.
process.exit(0);
