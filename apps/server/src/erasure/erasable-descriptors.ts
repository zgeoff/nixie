import {
  conversationErasableDescriptor,
  imageErasableDescriptor,
  recordErasableDescriptor,
} from '@heynixie/api';
import { connectionErasableDescriptor } from '@heynixie/connections';
import type { ErasableDescriptor } from '@heynixie/log';
import { memoryItemErasableDescriptor, momentErasableDescriptor } from '@heynixie/memory';
import { noteErasableDescriptor } from '@heynixie/notebook';
import { phoneTextErasableDescriptor } from '@heynixie/phone';

// The static descriptor of every kind nixie can forget, which the list generator and the partition
// test read without starting anything. The vault and locked kinds join when they exist.
export const erasableDescriptors: readonly ErasableDescriptor[] = [
  memoryItemErasableDescriptor,
  momentErasableDescriptor,
  noteErasableDescriptor,
  recordErasableDescriptor,
  imageErasableDescriptor,
  conversationErasableDescriptor,
  connectionErasableDescriptor,
  phoneTextErasableDescriptor,
];
