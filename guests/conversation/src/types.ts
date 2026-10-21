import type { McpServerConfig, query } from '@anthropic-ai/claude-agent-sdk';
import type { GuestFrame, InboxMessage } from '@heynixie/wire';

export interface TurnDependencies {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly toolServer: McpServerConfig;

  readonly messages: AsyncIterable<InboxMessage> | Iterable<InboxMessage>;
  readonly emit: (frame: GuestFrame) => Promise<void>;

  readonly runQuery?: typeof query;

  readonly waitBeforeReconnect?: () => Promise<void>;
}
