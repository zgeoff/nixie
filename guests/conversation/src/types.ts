import type { McpServerConfig, query } from '@anthropic-ai/claude-agent-sdk';
import type { GuestFrame, InboxMessage } from '@heynixie/wire';
import type { RequestRewriterOptions } from './rewrite/start-request-rewriter';

export interface TurnDependencies {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly toolServer: McpServerConfig;

  readonly messages: AsyncIterable<InboxMessage> | Iterable<InboxMessage>;
  readonly interrupt?: AbortSignal;
  readonly emit: (frame: GuestFrame) => Promise<void>;

  readonly runQuery?: typeof query;

  // a test passes a port to make the request rewriter's bind fail
  readonly rewriter?: RequestRewriterOptions;

  readonly waitBeforeReconnect?: () => Promise<void>;
}
