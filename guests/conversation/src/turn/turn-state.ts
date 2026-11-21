import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { ReportedUsage, SessionPoint } from '@heynixie/wire';
import type { Refusal } from '../rewrite/wait-for-refusal';
import type { TurnInputState } from './read-turn-input';

export type AssistantMessage = Extract<SDKMessage, { type: 'assistant' }>;

export interface TurnState extends TurnInputState {
  boundary: SessionPoint | null;

  committed: SessionPoint | null;

  contextSize: number | null;
  readonly compactWindow: number;

  isInterrupted: boolean;

  // true when the CLI's init lists the interrupt receipt, which a cut needs
  canCut: boolean;

  // the uuids that the CLI has queued and not yet started
  readonly queued: Set<string>;

  // true from the start of a main-chain model call to its end
  isStreaming: boolean;

  // true when the call in flight has begun a tool use, which the CLI may already run
  hasToolUse: boolean;

  // the cut in flight, from the interrupt that ends the model call to the result that follows
  cut: Cut | null;

  // the pending uuids that the interrupt receipt did not list
  readonly unlisted: Set<string>;

  cutCalls: number;
  carried: Carried;

  // the uuids that the cut call held and the session keeps, which the next finished call reads
  readonly heldReads: Set<string>;

  // a reply of reasoning alone, held until its call finishes
  held: AssistantMessage | null;

  // The CLI retried the model call that the next main-chain message answers.
  isRetried: boolean;

  // the usage the stream reported so far for the model call in flight
  reported: ReportedUsage;

  readonly refused: Promise<Refusal>;
}

export interface Cut {
  // the uuids that survive the cut, or null when the interrupt failed
  readonly receipt: Promise<readonly string[] | null>;
}

// what the cut calls of a turn used, which the turn end adds to the last result's
export interface Carried {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly turns: number;
  readonly thinkingTokens: number;
}

export const noCarried: Carried = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  turns: 0,
  thinkingTokens: 0,
};
