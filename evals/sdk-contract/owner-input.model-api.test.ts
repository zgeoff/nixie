import { expect, onTestFinished, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { waitForCondition } from '@heynixie/testing';
import { buildContractEnv } from '../test-utils/build-contract-env';
import { loadSessionTranscript } from '../test-utils/load-session-transcript';
import { runContractQuery } from '../test-utils/run-contract-query';
import { startInputStream } from '../test-utils/start-input-stream';

// Each probe calls the model on the subscription, so only a contract run enables it. Bun 1.4.2's
// skipIf takes a boolean and has no in-body skip.
const isContractRun = process.env['NIXIE_SDK_CONTRACT'] === '1';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-contract-owner-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const input = startInputStream();

  onTestFinished(() => {
    input.stop();
  });

  const options: Options = {
    cwd: directory,
    model: 'claude-haiku-5-5',
    settingSources: [],
    tools: ['Bash'],
    allowedTools: ['Bash'],
    permissionMode: 'default',
    permissionPrompts: 'none',
    maxTurns: 8,
    env: buildContractEnv(process.env, directory),
  };

  return { directory, input, options };
}

test.skipIf(!isContractRun)(
  'it reads a next message after the running command ends, in the same turn',
  async () => {
    const ctx = await setupTest();

    const ownerUUID = randomUUID();
    const owner = { sent: false };

    ctx.input.send(
      'Run these two shell commands with the Bash tool, one tool call per command, one after ' +
        'another: `sleep 6 && echo step-1`, then `echo step-2`. Then reply DONE.',
    );

    const run = await runContractQuery({
      prompt: ctx.input.messages,
      options: ctx.options,

      onMessage: (message) => {
        if (
          message.type === 'assistant' &&
          message.message.content.some((block) => block.type === 'tool_use') &&
          !owner.sent
        ) {
          owner.sent = true;

          ctx.input.send('Owner message: include the word PINEAPPLE in your next reply.', {
            uuid: ownerUUID,
            priority: 'next',
          });
        }

        return message.type === 'result';
      },
    });

    const stepOne = run.messages.findIndex(
      (message) =>
        message.type === 'user' && JSON.stringify(message.message.content).includes('step-1'),
    );

    const ownerRead = run.messages.findIndex(
      (message) =>
        message.type === 'assistant' && (message.user_message_uuids ?? []).includes(ownerUUID),
    );

    const firstResult = run.messages.findIndex((message) => message.type === 'result');

    expect(stepOne).toBeGreaterThan(-1);
    expect(ownerRead).toBeGreaterThan(stepOne);
    expect(firstResult).toBeGreaterThan(ownerRead);
  },
  120_000,
);

test.skipIf(!isContractRun)(
  'it keeps a queued next message through an interrupt, and the message starts the next turn',
  async () => {
    const ctx = await setupTest();

    const ownerUUID = randomUUID();
    const host: { interrupt: Promise<unknown> | null } = { interrupt: null };

    ctx.input.send(
      'Run this shell command with the Bash tool: `sleep 30 && echo step-1`. Then reply DONE.',
    );

    const run = await runContractQuery({
      prompt: ctx.input.messages,
      options: ctx.options,

      // The CLI records the task's own prompt as the transcript's first enqueue, so the owner's queued
      // message is the second.
      onMessage: (message, session) => {
        if (
          message.type === 'assistant' &&
          message.message.content.some((block) => block.type === 'tool_use') &&
          host.interrupt === null
        ) {
          ctx.input.send('Owner message: include the word PINEAPPLE in your next reply.', {
            uuid: ownerUUID,
            priority: 'next',
          });

          host.interrupt = (async () => {
            await waitForCondition(
              async () => {
                const transcript = await loadSessionTranscript(ctx.directory, message.session_id);

                return (
                  transcript.filter(
                    (entry) => entry.type === 'queue-operation' && entry['operation'] === 'enqueue',
                  ).length >= 2
                );
              },
              { timeoutMs: 20_000 },
            );

            return session.interrupt();
          })();
        }

        return (
          message.type === 'assistant' && (message.user_message_uuids ?? []).includes(ownerUUID)
        );
      },
    });

    const results = run.messages.flatMap((message) =>
      message.type === 'result' ? [message.subtype] : [],
    );

    const receipt = await host.interrupt;

    expect(receipt).toMatchObject({ still_queued: [ownerUUID] });
    expect(results).toStrictEqual(['error_during_execution']);
    expect(run.messages.at(-1)).toMatchObject({ type: 'assistant' });
  },
  120_000,
);
