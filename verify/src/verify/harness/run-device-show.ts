import type { ContractClient } from '@heynixie/contract';
import type { ScriptedReply } from '@heynixie/testing';
import { buildDeviceShowReplies } from './build-device-show-replies';
import type { DeviceShowInput } from './build-device-show-replies';

export interface ReplyQueue {
  readonly addReplies: (...replies: ScriptedReply[]) => void;
}

// A 2 by 1 pixel PNG, which nixie keeps as an image the model can show.
const photoPNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg==';

// Queues the turn that shows a photo on a device, then sends the photo as the owner's message.
export async function runDeviceShow(
  client: ContractClient,
  model: ReplyQueue,
  show: DeviceShowInput,
): Promise<number> {
  const sent = Promise.withResolvers<void>();
  const photo = { eventID: 0 };

  const replies = buildDeviceShowReplies(show, {
    isSent: sent.promise,
    readEventID: () => photo.eventID,
  });

  model.addReplies(...replies);

  const answer = await client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    images: [new File([Uint8Array.fromBase64(photoPNG)], 'photo.png', { type: 'image/png' })],
    spans: [],
    text: 'Show this photo on the screen in the hall.',
    thread: 'conversation',
  });

  photo.eventID = answer.sequence;

  sent.resolve();

  return replies.length;
}
