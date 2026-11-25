import { pageDataSchema } from '@heynixie/contract';
import type { ErasableFields, JSONObject } from '@heynixie/log';
import { devicePageEventCodec } from '../record/device-page-event-codec';
import type { RenderedPageEvent } from './render-page-event';

// A page event record as the assistant reads it. A forget removes the page's data and keeps the
// rest, so the data is null once its key is gone.
export function toRenderedPageEvent(
  payload: JSONObject,
  erasable: ErasableFields,
): RenderedPageEvent {
  const event = devicePageEventCodec.decode(payload);

  const data =
    erasable.status === 'readable' ? pageDataSchema.safeParse(erasable.fields['data']) : null;

  return {
    deviceName: event.deviceName,
    region: event.region,
    name: event.name,
    data: data?.success === true ? data.data : null,
  };
}
