import type { UUID } from 'node:crypto';
import { setTimeout as waitForDelay } from 'node:timers/promises';
import type { Options, SDKAssistantMessage, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { match } from 'ts-pattern';
import { commandLifecycleSchema } from '../turn/command-lifecycle-schema';
import { buildProbeOptions } from './build-probe-options';
import { loadSessionTranscript } from './load-session-transcript';
import type { ContractRun } from './run-contract-query';
import { runContractQuery } from './run-contract-query';
import { startInputStream } from './start-input-stream';
import type { ProbeTarget } from './types';

export type OwnerInputScenario = 'after-command' | 'through-interrupt' | 'mid-reply';

export interface OwnerInputRun {
  readonly ownerUUID: UUID;
  readonly run: ContractRun;
  readonly receipt: unknown;

  // the owner messages sent after the interrupt, in the order sent
  readonly followUUIDs: readonly UUID[];
}

export function runOwnerInputProbe(
  target: ProbeTarget,
  scenario: OwnerInputScenario,
): Promise<OwnerInputRun> {
  const options: Options = {
    ...buildProbeOptions(target),
    tools: ['Bash'],
    allowedTools: ['Bash'],
    permissionMode: 'default',
    permissionPrompts: 'none',
    maxTurns: 8,
  };

  const ownerUUID = crypto.randomUUID();

  return match(scenario)
    .with('after-command', () => runAfterCommand(options, ownerUUID))
    .with('through-interrupt', () => runThroughInterrupt(options, target.directory, ownerUUID))
    .with('mid-reply', () => runMidReply(options, ownerUUID))
    .exhaustive();
}

async function runAfterCommand(options: Options, ownerUUID: UUID): Promise<OwnerInputRun> {
  const input = startInputStream();
  const owner = { isSent: false };

  input.send(
    'Run these two shell commands with the Bash tool, one tool call per command, one after ' +
      'another: `sleep 6 && echo step-1`, then `echo step-2`. Then reply DONE.',
  );

  const run = await runContractQuery({
    prompt: input.messages,
    options,

    onMessage: (message) => {
      if (isToolCall(message) && !owner.isSent) {
        owner.isSent = true;

        input.send('Owner message: include the word PINEAPPLE in your next reply.', {
          uuid: ownerUUID,
          priority: 'next',
        });
      }

      return message.type === 'result';
    },
  });

  input.stop();

  return { ownerUUID, run, receipt: null, followUUIDs: [] };
}

function isToolCall(message: SDKMessage): message is SDKAssistantMessage {
  return (
    message.type === 'assistant' &&
    message.message.content.some((block) => block.type === 'tool_use')
  );
}

async function runThroughInterrupt(
  options: Options,
  directory: string,
  ownerUUID: UUID,
): Promise<OwnerInputRun> {
  const input = startInputStream();
  const host: { interrupt: Promise<unknown> | null } = { interrupt: null };

  // The CLI refuses a command that starts with a sleep of 25 s or more, so the call would end
  // before the interrupt.
  input.send(
    'Run this shell command with the Bash tool: `sleep 20 && echo step-1`. Then reply DONE.',
  );

  const run = await runContractQuery({
    prompt: input.messages,
    options,

    onMessage: (message, session) => {
      if (isToolCall(message) && host.interrupt === null) {
        input.send('Owner message: include the word PINEAPPLE in your next reply.', {
          uuid: ownerUUID,
          priority: 'next',
        });

        host.interrupt = (async () => {
          await waitForOwnerEnqueue(directory, message.session_id);

          return session.interrupt();
        })();
      }

      return message.type === 'assistant' && (message.user_message_uuids ?? []).includes(ownerUUID);
    },
  });

  input.stop();

  return { ownerUUID, run, receipt: await host.interrupt, followUUIDs: [] };
}

// The CLI records the task's own prompt as the transcript's first enqueue, so the owner's queued
// message is the second. Against a fast model the CLI can stream a tool call before it writes the
// transcript at all.
async function waitForOwnerEnqueue(directory: string, sessionID: string): Promise<void> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const transcript = await loadSessionTranscript(directory, sessionID).catch(() => []);

    const enqueues = transcript.filter(
      (entry) => entry.type === 'queue-operation' && entry['operation'] === 'enqueue',
    );

    if (enqueues.length >= 2) {
      return;
    }

    await waitForDelay(50);
  }

  throw new Error(`the owner's message never reached the queue of session ${sessionID}`);
}

export const midReplyOpeningPrompt =
  'Write a long, detailed answer of at least 40 sentences about how a clock works.';

export const midReplyTexts = [
  'Owner message: include the code word PINEAPPLE in your reply.',
  'Owner message: also include the code word MANGO in your reply.',
  'Owner message: also include the code word KIWI in your reply.',
] as const;

async function runMidReply(options: Options, ownerUUID: UUID): Promise<OwnerInputRun> {
  const input = startInputStream();
  const secondUUID = crypto.randomUUID();
  const thirdUUID = crypto.randomUUID();
  const followUUIDs = [secondUUID, thirdUUID];

  const host: {
    isCut: boolean;
    results: number;
    interrupt: Promise<unknown> | null;
    queued: PromiseWithResolvers<void>;
  } = {
    isCut: false,
    results: 0,
    interrupt: null,
    queued: Promise.withResolvers(),
  };

  input.send(midReplyOpeningPrompt);

  const run = await runContractQuery({
    prompt: input.messages,
    options: { ...options, tools: [], allowedTools: [], includePartialMessages: true, maxTurns: 4 },

    onMessage: (message, session) => {
      const lifecycle = commandLifecycleSchema.safeParse(message);

      if (
        lifecycle.success &&
        lifecycle.data.state === 'queued' &&
        lifecycle.data.command_uuid === ownerUUID
      ) {
        host.queued.resolve();
      }

      if (isMainTextDelta(message) && !host.isCut) {
        host.isCut = true;

        input.send(midReplyTexts[0], { uuid: ownerUUID, priority: 'next' });

        host.interrupt = (async () => {
          await host.queued.promise;

          const receipt = await session.interrupt();

          input.send(midReplyTexts[1], { uuid: secondUUID, priority: 'next' });
          input.send(midReplyTexts[2], { uuid: thirdUUID, priority: 'next' });

          return receipt;
        })();
      }

      if (message.type === 'result') {
        host.results += 1;
      }

      return host.results >= 2;
    },
  });

  input.stop();

  return { ownerUUID, run, receipt: await host.interrupt, followUUIDs };
}

function isMainTextDelta(message: SDKMessage): boolean {
  return (
    message.type === 'stream_event' &&
    message.parent_tool_use_id === null &&
    message.event.type === 'content_block_delta' &&
    message.event.delta.type === 'text_delta'
  );
}
