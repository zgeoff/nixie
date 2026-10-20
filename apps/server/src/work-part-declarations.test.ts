import { expect, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { z } from 'zod';
import { createTestClient } from './test-utils/create-test-client';
import { runHostCommand } from './test-utils/run-host-command';
import { startTestNixie } from './test-utils/start-test-nixie';

test('it logs a skill export that fails at the error level', async () => {
  // nothing listens on the discard port, so the export's first request fails
  const nixie = await startTestNixie({
    extraDefinitions: [
      'export: { repository: harbour/definitions, api_url: "https://127.0.0.1:9" }',
    ],
    extraSecrets: ['definitions_export_token: token-a'],
  });

  const clients = await createTestClient(nixie);

  nixie.model.addReplies(
    {
      toolUse: {
        name: 'mcp__nixie__skill_write',
        input: {
          name: 'tide-tables',
          files: [
            {
              path: 'SKILL.md',
              text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
            },
          ],
        },
      },
    },
    { text: 'Proposed.' },
  );

  await clients.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Write a skill for reading tide tables.',
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const page = await clients.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'Proposed.');
  });

  const listed = await runHostCommand(nixie.configPath, ['skill-pending']);

  const [{ proposalID, skillHash }] = z
    .tuple([z.object({ proposalID: z.string(), skillHash: z.string() })])
    .parse(JSON.parse(listed.stdout));

  await runHostCommand(nixie.configPath, ['skill-approve', proposalID, '--hash', skillHash]);

  const failed = await nixie.waitForLogEvent('skills.export_failed');

  expect(failed).toMatchObject({ level: 'error' });
}, 60_000);
