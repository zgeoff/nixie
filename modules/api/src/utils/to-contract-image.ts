import type { ProposalImage } from '@heynixie/memory';

export function toContractImage(image: ProposalImage | null) {
  return image === null
    ? null
    : { thread: image.thread, sequence: image.messageSequence, position: image.image - 1 };
}
