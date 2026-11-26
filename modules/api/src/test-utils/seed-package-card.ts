import { toPackageCardBytes } from '@heynixie/devices';
import { writeRecords } from '@heynixie/log';
import { buildActionProposalInput } from '@heynixie/policy';
import { toolCalledCodec } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import type { APIContext } from '../types';

// The call that asks for npm package chart.js 4.4.6, with its stored card, and the proposal that
// asks the owner about it.
export async function seedPackageCard(context: APIContext): Promise<{ readonly shortID: string }> {
  const input = { name: 'chart.js', version: '4.4.6' };

  const [called] = await writeRecords(context.log, [
    {
      kind: 'tool_called',
      definitions: context.definitions(),
      thread: 'conversation',
      payload: toolCalledCodec.encode({
        callID: 'call-1',
        runID: 'run-1',
        toolUseID: null,
        tool: 'device.addPackage',
      }),
      erasable: { input },
      attachments: [
        toPackageCardBytes({
          name: 'chart.js',
          version: '4.4.6',
          unpackedBytes: 2048,
          publisher: 'a-publisher',
          description: 'Charts for pages',
          integrity: `sha512-${'A'.repeat(86)}==`,
        }),
      ],
    },
  ]);

  invariant(called, 'the log wrote the call');

  const proposed = buildActionProposalInput({
    definitions: context.definitions(),
    thread: 'conversation',
    callSequence: called.sequence,
    tool: 'device.addPackage',
    effects: ['install_package'],
    cause: 'always_ask',
    input,
    destinations: [{ value: 'registry.npmjs.org', replyTarget: false }],
  });

  await writeRecords(context.log, [proposed.record]);

  return { shortID: proposed.shortID };
}
