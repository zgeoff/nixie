import { runConversationGuest } from './run-conversation-guest';

// The conversation image's entry: one turn over framed stdin and stdout. It exits once the turn
// ends, because the host keeps its stdin open until then.
const writer = Bun.stdout.writer();

await runConversationGuest({
  input: Bun.stdin.stream(),
  write: async (bytes) => {
    await writer.write(bytes);
    await writer.flush();
  },
  env: process.env,
});

process.exit(0);
