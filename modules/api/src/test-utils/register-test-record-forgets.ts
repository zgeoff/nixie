import type { ErasureRegistry } from '@heynixie/log';
import { imageErasableDescriptor } from '../erasable/image-erasable-descriptor';
import { recordErasableDescriptor } from '../erasable/record-erasable-descriptor';
import { buildImageErasable } from '../image/erasure/build-image-erasable';
import { buildRecordErasable } from '../record/erasure/build-record-erasable';
import type { APIContext, RecordForgets } from '../types';

// Registers the record and the image on a runner, as the server does, and answers their handles.
export function registerTestRecordForgets(
  context: APIContext,
  runner: ErasureRegistry,
): RecordForgets {
  return {
    record: runner.register({ ...recordErasableDescriptor, ...buildRecordErasable(context) }),
    image: runner.register({ ...imageErasableDescriptor, ...buildImageErasable(context) }),
  };
}
