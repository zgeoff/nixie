import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

export interface StubToolServer {
  readonly config: McpSdkServerConfigWithInstance;

  // the name of each tool the model called, in order
  readonly calls: readonly string[];

  // resolves once the model calls note_wait, which then holds until release
  readonly waitForHeldCall: () => Promise<void>;
  readonly release: () => void;
}

// Builds an in-process stand-in for nixie's tool server, named nixie as the real one is. A guest
// never imports a module, so its tests serve these stub tools: note_read answers at once, and
// note_wait holds its call open until the test releases it.
export function buildStubToolServer(): StubToolServer {
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
