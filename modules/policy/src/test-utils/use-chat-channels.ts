import { onTestFinished } from 'bun:test';
import { writeChatChannels } from '../place/write-chat-channels';

// Names the chat channels that a handle can name for the rest of one test.
export function useChatChannels(names: readonly string[]): void {
  writeChatChannels(names);

  onTestFinished(() => {
    writeChatChannels([]);
  });
}
