import { writeRecords } from '@heynixie/log';
import { buildActionProposalInput } from '@heynixie/policy';
import { toolCalledCodec } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import type { APIContext } from '../types';

interface ScreenClickCard {
  readonly shortID: string;

  // the sequence of the click's call record, which holds its stored picture
  readonly callSequence: number;

  // the sequence of the proposal's record, which a forget names
  readonly proposalSequence: number;
}

// The call of a screen click at 412, 233 with its stored picture, when it has one, and the proposal
// that asks the owner about it.
export async function seedScreenClickCard(
  context: APIContext,
  picture: Uint8Array<ArrayBuffer> | null,
): Promise<ScreenClickCard> {
  const input = { x: 412, y: 233, button: 'left' };

  const [called] = await writeRecords(context.log, [
    {
      kind: 'tool_called',
      definitions: context.definitions(),
      thread: 'conversation',
      payload: toolCalledCodec.encode({
        callID: 'call-1',
        runID: 'run-1',
        toolUseID: null,
        tool: 'computer.screen_click',
      }),
      erasable: { input },
      ...(picture === null ? {} : { attachments: [picture] }),
    },
  ]);

  invariant(called, 'the log wrote the call');

  const proposed = buildActionProposalInput({
    definitions: context.definitions(),
    thread: 'conversation',
    callSequence: called.sequence,
    tool: 'computer.screen_click',
    effects: ['send'],
    cause: 'ask_rule',
    input,
    destinations: [{ value: 'site.test', replyTarget: false }],
  });

  const [written] = await writeRecords(context.log, [proposed.record]);

  invariant(written, 'the log wrote the proposal');

  return {
    shortID: proposed.shortID,
    callSequence: called.sequence,
    proposalSequence: written.sequence,
  };
}
