import type { McpServerConfig, query } from '@anthropic-ai/claude-agent-sdk';
import type { GuestFrame, InboxMessage } from '@heynixie/wire';

export interface TurnDependencies {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly toolServer: McpServerConfig;

  // the host's messages for the running turn, each delivered at the model's next tool boundary
  readonly messages: AsyncIterable<InboxMessage> | Iterable<InboxMessage>;
  readonly emit: (frame: GuestFrame) => Promise<void>;

  // the SDK's query(), which a test passes through a recorder to see every call's options
  readonly runQuery?: typeof query;

  // the pause before the one reconnect to nixie's tool server, a second by default
  readonly waitBeforeReconnect?: () => Promise<void>;
}
