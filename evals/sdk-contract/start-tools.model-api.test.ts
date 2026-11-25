import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildContractEnv,
  runStartToolsProbe,
  startToolNames,
} from '@heynixie/conversation/sdk-contract';
import { network } from '@heynixie/mock-server';
import { createTestClient, startInProcessNixie } from '@heynixie/server/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { HttpResponse, http } from 'msw';
import invariant from 'tiny-invariant';

// Each probe calls the model on the subscription, so only a contract run enables it. Bun 1.4.2's
// skipIf takes a boolean and has no in-body skip.
const isContractRun = process.env['NIXIE_SDK_CONTRACT'] === '1';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-contract-start-tools-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  // the coding runner reads its sessions from the gateway as nixie starts; a refusal leaves the tools
  network.use(
    http.post('https://atc.example.test/mcp', () =>
      HttpResponse.json({ error: 'refused' }, { status: 500 }),
    ),
  );

  const nixie = await startInProcessNixie({
    extraConfig: [
      'coding:',
      '  atc:',
      '    url: https://atc.example.test/mcp',
      '    principal: service:nixie',
      '    token: deployment:atc_token',
      '    targets:',
      '      - { daemon: cloud, target: cloud }',
      '    defaultTarget: cloud/cloud',
    ],
    extraSecrets: ['atc_token: atcs_token-value'],
  });

  const api = await createTestClient(nixie);

  const gate = Promise.withResolvers<void>();

  nixie.guest.addReplies({ text: 'Hello.', gate: () => gate.promise });

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Hi.',
    thread: 'conversation',
  });

  await waitForCondition(() => nixie.guest.turns.length === 1);

  const [received] = nixie.guest.received;

  invariant(received, 'the conversation turn reached the guest');

  const listed = await nixie.readTools(received);

  gate.resolve();

  return { target: { directory, env: buildContractEnv(process.env, directory) }, listed };
}

test.skipIf(!isContractRun)(
  "it lists both task_start and coding_start in the tool list that the SDK reports at init, from the conversation's own tool list",
  async () => {
    const ctx = await setupTest();
    const probe = await runStartToolsProbe(ctx.target, ctx.listed);

    expect(probe.tools).toIncludeAllMembers([...startToolNames]);
  },
  60_000,
);
