import { expect, test } from 'bun:test';
import { buildNotebookTools } from '@heynixie/notebook';
import { buildPolicyCall, readStarterDecisionPoint } from '@heynixie/policy/test-utils';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { createTestClient } from '../test-utils/create-test-client';
import { sendClientMessage } from '../test-utils/send-client-message';
import { startInProcessNixie } from '../test-utils/start-in-process-nixie';

async function setupTest() {
  const nixie = await startInProcessNixie();
  const api = await createTestClient(nixie);

  const callTool = async (name: string, input: Record<string, unknown>) => {
    nixie.guest.addReplies({ toolUse: { name, input } }, { text: 'Done.' });

    await sendClientMessage(api.client, { text: `Please run ${name}.` }, 'Done.');

    const result = nixie.toolResults.at(-1);

    invariant(result);

    return z
      .object({ structuredContent: z.record(z.string(), z.unknown()).optional() })
      .parse(JSON.parse(result.result)).structuredContent;
  };

  return { ...nixie, api, callTool };
}

test('it lets the conversation write a note, which the web client then lists and reads', async () => {
  const ctx = await setupTest();

  const written = await ctx.callTool('notebook.write', {
    title: 'Why the boiler keeps tripping',
    body: 'The trip happens after a cold night.',
    tags: ['home'],
  });

  const note = String(written?.['note']);

  const listed = await ctx.api.client.notebook.listNotes({});
  const read = await ctx.api.client.notebook.readNote({ note });

  expect(listed.notes.map((entry) => entry.title)).toStrictEqual(['Why the boiler keeps tripping']);
  expect(read).toMatchObject({ note, body: 'The trip happens after a cold night.', version: 1 });
});

test('it gives the conversation the 9 notebook tools that read and link', async () => {
  const ctx = await setupTest();
  const written = await ctx.callTool('notebook.write', { title: 'First', body: 'Body.' });

  const note = String(written?.['note']);

  const second = await ctx.callTool('notebook.write', { title: 'Second', body: 'Body.' });

  const other = String(second?.['note']);

  const edited = await ctx.callTool('notebook.edit', { note, append: ' More.' });
  const read = await ctx.callTool('notebook.read', { note });
  const history = await ctx.callTool('notebook.history', { note });
  const found = await ctx.callTool('notebook.find', {});

  const linked = await ctx.callTool('notebook.link', {
    from: note,
    to: { note: other },
    type: 'cites',
  });

  const walked = await ctx.callTool('notebook.walk', { from: note });

  const unlinked = await ctx.callTool('notebook.unlink', {
    from: note,
    to: { note: other },
    type: 'cites',
  });

  const checked = await ctx.callTool('notebook.check', {});

  expect([
    edited?.['version'],
    read?.['version'],
    history?.['next'],
    found?.['isMeaningPartial'],
    linked?.['linked'],
    walked?.['isCut'],
    unlinked?.['unlinked'],
    checked?.['orphanCount'],
  ]).toStrictEqual([2, 2, null, expect.any(Boolean), true, false, true, 2]);
});

test('it lets the conversation forget a note, which the web client then lists as gone', async () => {
  const ctx = await setupTest();
  const written = await ctx.callTool('notebook.write', { title: 'Boiler', body: 'Body.' });

  const note = String(written?.['note']);

  ctx.guest.addReplies({ toolUse: { name: 'notebook.forget', input: { id: note } } });

  await ctx.api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Please forget the boiler note.',
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const listed = await ctx.api.client.notebook.listNotes({});

    return listed.notes.length === 0;
  });

  const read = await ctx.api.client.notebook.readNote({ note }).catch((error: unknown) => error);

  expect(read).toMatchObject({ code: 'UNKNOWN_NOTE' });

  ctx.signalStop();

  const stopped = await ctx.waitForExit();

  expect(stopped.records.map((record) => record.kind)).not.toContain('policy.action_proposed');
});

test('it forgets a note from the web client, and the conversation then reads it as unknown', async () => {
  const ctx = await setupTest();
  const written = await ctx.callTool('notebook.write', { title: 'Boiler', body: 'Body.' });

  const note = String(written?.['note']);

  await ctx.api.client.notebook.forget({
    clientActionID: crypto.randomUUID(),
    note,
    version: 1,
  });

  const read = await ctx.callTool('notebook.read', { note });

  expect(read).toMatchObject({ refused: 'UNKNOWN_NOTE' });
});

test('it lets the starter rules run notebook.forget with no approval', async () => {
  const tool = buildNotebookTools(() => {
    throw new Error('no store is needed to read a declaration');
  }).find((entry) => entry.name === 'notebook.forget');

  invariant(tool);

  const decide = readStarterDecisionPoint(() => tool.declaration);

  const decided = await decide(
    buildPolicyCall({
      tool: 'notebook.forget',
      toolList: ['notebook.forget'],
      context: 'conversation',
    }),
  );

  expect(decided.decision.outcome).toBe('allow');
});
