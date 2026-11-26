import type { ContractClient } from '@heynixie/contract';
import { buildLayoutReplies } from './build-layout-replies';
import type { LayoutStep } from './build-layout-replies';
import type { ReplyQueue } from './run-device-show';

export interface DeviceLayoutInput {
  readonly step: LayoutStep;
  readonly text: string;
}

const layoutMessages = {
  set: 'Lay out the screen in the hall.',
  update: 'Change the note on the screen in the hall.',
  save: 'Save the layout of the screen in the hall as evening.',
  change: 'Change the layout of the screen in the hall.',
  restore: 'Restore the evening layout of the screen in the hall.',
  preview: 'Show me what the screen in the hall looks like.',
  page: 'Put a page in the pond of the screen in the hall.',
  message: 'Send the page in the pond of the screen in the hall a message.',
  install: 'Get the ripple counter package approved for the pages.',
  package: 'Put the tide page in the pond of the screen in the hall.',
} as const satisfies Record<LayoutStep, string>;

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
    text: layoutMessages[layout.step],
    thread: 'conversation',
  });

  return replies.length;
}
