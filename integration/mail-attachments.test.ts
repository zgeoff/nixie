import { expect, test } from 'bun:test';
import { buildActionSeeder } from '@heynixie/actions/test-utils';
import { readToolResult } from '@heynixie/connectors/test-utils';
import type { JSONObject } from '@heynixie/log';
import { buildMailTools, parseMail } from '@heynixie/mail';
import { seedReceivedMail, startTestMail } from '@heynixie/mail/test-utils';
import { buildAllowingDecisionPoint } from '@heynixie/policy/test-utils';
import { buildMailPorts } from '@heynixie/server';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { z } from 'zod';

async function setupTest() {
  const mail = await startTestMail({ buildPorts: buildMailPorts });

  const taskSeed = buildTaskSeeder({ context: mail.tasks });
  const actionSeed = buildActionSeeder({ context: mail.tasks });

  const starter = await taskSeed.conversationStep();

  return {
    ...mail,
    queueSend: async (tool: string, args: JSONObject) => {
      const action = await actionSeed.action({ step: starter.claim, tool, arguments: args });

      return {
        actionID: action.action_id,
        tool,
        arguments: args,
        attempt: 1,
        idempotencyKey: `key-${action.action_id}`,
        destinations: [],
        actionHash: action.action_hash,
        deadlineAt: null,
      };
    },
  };
}

test('it sends an attachment that mail.save_attachment kept as a file of the thread', async () => {
  const ctx = await setupTest();

  const bytes = new Uint8Array([37, 80, 68, 70, 9, 8, 7]);

  const received = await seedReceivedMail(ctx, {
    from: 'hello@library.example.org',
    subject: 'Receipt',
    text: 'Your receipt.',
    attachments: [{ name: 'receipt.pdf', content: bytes }],
  });

  const tool = buildMailTools(ctx.context, ctx.html).find(
    (candidate) => candidate.name === 'mail.save_attachment',
  );

  invariant(tool !== undefined, 'the module has the save tool');

  const saved = await runToolCall(
    {
      tool: 'mail.save_attachment',
      input: { message: received.shortID, attachment: 1 },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: ['mail.save_attachment'],
      model: { model: 'model-a', profile: 'chat-direct' },
    },
    {
      registry: buildToolRegistry([tool]),
      decide: buildAllowingDecisionPoint(),
      log: ctx.context.log,
      definitions: ctx.context.definitions,
      queue: {
        enqueue: () => Promise.reject(new Error('mail.save_attachment runs direct')),
        readOpenRepeat: () => Promise.resolve(null),
        readOpenAsk: () => Promise.resolve(null),
        waitForOutcome: () => Promise.resolve(null),
      },
      queuedWaitMs: 1000,
    },
  );

  const fileID = z.object({ file: z.string() }).parse(readToolResult(saved)).file;

  const attempt = await ctx.queueSend('mail.reply', {
    message: received.shortID,
    text: 'Thanks, here it is again.',
    files: [fileID],
  });

  const response = await ctx.connectors.get('mail.reply')?.run(attempt);

  const [sent] = ctx.host.readSent();
  const parsed = parseMail(sent?.raw ?? new Uint8Array());

  expect(response).toMatchObject({ kind: 'success' });
  expect(parsed.attachments).toStrictEqual([{ name: 'receipt.pdf', bytes: 7 }]);
  expect(parsed.attachmentContents).toStrictEqual([bytes]);
});
