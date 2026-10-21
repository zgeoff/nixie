import type { ContractClient } from '@heynixie/contract';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { runHostCommand } from './run-host-command';
import { runHostCommands } from './run-host-commands';
import { sendClientMessage } from './send-client-message';
import type { TestNixie } from './start-test-nixie';

export interface ApprovedItem {
  readonly itemID: string;
  readonly text: string;
}

export async function createApprovedItems(
  nixie: Pick<TestNixie, 'model' | 'configPath'>,
  client: Pick<ContractClient, 'conversation'>,
  texts: readonly [string, ...string[]],
): Promise<readonly [ApprovedItem, ...ApprovedItem[]]> {
  nixie.model.addReplies(
    ...texts.map((text) => ({ toolUse: { name: 'mcp__nixie__memory_remember', input: { text } } })),
    { text: 'Noted them down.' },
  );

  await sendClientMessage(client, { text: 'Note a few things down for me.' }, 'Noted them down.');

  const listed = await runHostCommand(nixie.configPath, ['memory-pending']);

  const proposals = z
    .array(
      z.object({
        proposalID: z.string(),
        itemID: z.string(),
        actionHash: z.string(),
        text: z.string(),
      }),
    )
    .parse(JSON.parse(listed.stdout));

  await runHostCommands(
    nixie.configPath,
    proposals.map((proposal) => [
      'memory-approve',
      proposal.proposalID,
      '--hash',
      proposal.actionHash,
    ]),
  );

  const toItem = (text: string): ApprovedItem => {
    const proposal = proposals.find((pending) => pending.text === text);

    invariant(proposal);

    return { itemID: proposal.itemID, text };
  };

  const [first, ...rest] = texts;

  return [toItem(first), ...rest.map((text) => toItem(text))];
}
