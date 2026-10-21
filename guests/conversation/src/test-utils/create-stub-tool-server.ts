import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

export interface StubToolServer {
  readonly config: McpSdkServerConfigWithInstance;

  readonly calls: readonly string[];

  readonly waitForHeldCall: () => Promise<void>;
  readonly release: () => void;
}

export function createStubToolServer(): StubToolServer {
  const calls: string[] = [];
  const held = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();

  const config = createSdkMcpServer({
    name: 'nixie',
    version: '0.0.0',
    alwaysLoad: true,
    tools: [
      tool('note_read', 'Reads a note by its name.', { name: z.string() }, (input) => {
        calls.push('note_read');

        return Promise.resolve({ content: [{ type: 'text', text: `the note ${input.name}` }] });
      }),
      tool('note_wait', 'Waits for a note to change.', {}, async () => {
        calls.push('note_wait');
        held.resolve();

        await released.promise;

        return { content: [{ type: 'text', text: 'the note changed' }] };
      }),
    ],
  });

  return {
    config,
    calls,
    waitForHeldCall: () => held.promise,
    release: () => {
      released.resolve();
    },
  };
}
