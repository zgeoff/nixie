import { expect, test } from 'bun:test';
import { z } from 'zod';
import { createTestClient } from './test-utils/create-test-client';
import { runHostCommand } from './test-utils/run-host-command';
import { sendClientMessage } from './test-utils/send-client-message';
import { startInProcessNixie } from './test-utils/start-in-process-nixie';

test('it logs a skill export that fails at the error level', async () => {
  // nothing listens on the discard port, so the export's first request fails
  const nixie = await startInProcessNixie({
    extraDefinitions: [
      'export: { repository: harbour/definitions, api_url: "https://127.0.0.1:9" }',
    ],
    extraSecrets: ['definitions_export_token: token-a'],
  });

  const clients = await createTestClient(nixie);

  nixie.guest.addReplies(
    {
      toolUse: {
        name: 'skill_write',
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

  await sendClientMessage(
    clients.client,
    { text: 'Write a skill for reading tide tables.' },
    'Proposed.',
  );

  const listed = await runHostCommand(nixie.configPath, ['skill-pending']);

  const [{ proposalID, skillHash }] = z
    .tuple([z.object({ proposalID: z.string(), skillHash: z.string() })])
    .parse(JSON.parse(listed.stdout));

  await runHostCommand(nixie.configPath, ['skill-approve', proposalID, '--hash', skillHash]);

  const failed = await nixie.waitForLogEvent('definitions.export_failed');

  expect(failed).toMatchObject({ level: 'error' });
});
