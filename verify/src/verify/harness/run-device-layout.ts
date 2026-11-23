import type { ContractClient } from '@heynixie/contract';
import { buildLayoutReplies } from './build-layout-replies';
import type { ReplyQueue } from './run-device-show';

export interface DeviceLayoutInput {
  readonly step: 'set' | 'update';
  readonly text: string;
}

// Queues the turn that lays out the first device's screen, or updates one of its regions, then
// sends the owner's message that starts the turn. The message is fixed for each step, so the
// journey's `conversation turn` names it.
export async function runDeviceLayout(
  client: ContractClient,
  model: ReplyQueue,
  layout: DeviceLayoutInput,
): Promise<number> {
  const replies = [...buildLayoutReplies(layout.step), { text: layout.text }];

  model.addReplies(...replies);

  await client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    images: [],
    spans: [],
    text:
      layout.step === 'set'
        ? 'Lay out the screen in the hall.'
        : 'Change the note on the screen in the hall.',
    thread: 'conversation',
  });

  return replies.length;
}
